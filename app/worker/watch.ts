// Scans vault events on one network and turns them into alerts / auto-save bookkeeping.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, decodeEventLog, formatUnits, http, type Address, type PublicClient } from "viem";
import { stashFactoryAbi, stashVaultAbi } from "../src/lib/abis.ts";
import { NETWORKS, type NetworkKey } from "../src/lib/config.ts";
import type { NetworkState } from "./store.ts";

export type Alert = { network: NetworkKey; vault: string; html: string; severity: "warn" | "info"; block?: bigint };

const BROADCAST = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "contracts", "broadcast");

const clients = new Map<NetworkKey, PublicClient>();
export function client(key: NetworkKey): PublicClient {
  let c = clients.get(key);
  if (!c) {
    c = createPublicClient({ chain: NETWORKS[key].chain, transport: http() }) as PublicClient;
    clients.set(key, c);
  }
  return c;
}

/** Block the factory was deployed in, from Foundry's broadcast records (or START_BLOCK_<KEY>). */
export function deployBlock(key: NetworkKey): bigint {
  const fromEnv = process.env[`START_BLOCK_${key.toUpperCase()}`];
  if (fromEnv) return BigInt(fromEnv);
  const factory = NETWORKS[key].factory?.toLowerCase();
  const chainId = String(NETWORKS[key].chain.id);
  if (factory && existsSync(BROADCAST)) {
    for (const script of readdirSync(BROADCAST)) {
      const file = join(BROADCAST, script, chainId, "run-latest.json");
      if (!existsSync(file)) continue;
      const run = JSON.parse(readFileSync(file, "utf8")) as { receipts?: { contractAddress?: string; blockNumber: string }[] };
      const r = run.receipts?.find((x) => x.contractAddress?.toLowerCase() === factory);
      if (r) return BigInt(r.blockNumber);
    }
  }
  throw new Error(`Unknown deploy block for ${key}; set START_BLOCK_${key.toUpperCase()}`);
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usd18 = (v: bigint) => `$${Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function tokenAmount(key: NetworkKey, token: string, amount: bigint) {
  const t = NETWORKS[key].tokens.find((x) => x.address.toLowerCase() === token.toLowerCase());
  return t ? `$${Number(formatUnits(amount, t.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `${amount} units`;
}

const when = (unix: bigint) => new Date(Number(unix) * 1000).toUTCString().replace(" GMT", " UTC");

/** Fetches logs from `from` to `to`, halving the range when an RPC rejects a large query. */
async function getLogsChunked(c: PublicClient, address: Address[], from: bigint, to: bigint) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  let start = from;
  let size = 5_000n;
  while (start <= to) {
    const end = start + size - 1n > to ? to : start + size - 1n;
    try {
      out.push(...(await c.getLogs({ address, fromBlock: start, toBlock: end })));
      start = end + 1n;
    } catch (e) {
      if (size <= 100n) throw e;
      size /= 2n;
    }
  }
  return out;
}

/** Processes new blocks for one network: discovers vaults, records auto-saves, returns alerts. */
export async function scan(key: NetworkKey, ns: NetworkState): Promise<Alert[]> {
  const net = NETWORKS[key];
  if (!net.factory) return [];
  const c = client(key);
  const head = await c.getBlockNumber();
  const from = BigInt(ns.lastBlock) + 1n;
  if (from > head) return [];
  // Cap one pass so a long backlog is processed in pieces and progress is saved between them.
  const to = head - from > 50_000n ? from + 50_000n : head;

  const factory = net.factory.toLowerCase();
  const created = await getLogsChunked(c, [net.factory], from, to);
  // Guardians set at creation are expected; don't alert on them.
  const creationTxs = new Set<string>();
  for (const log of created) {
    try {
      const ev = decodeEventLog({ abi: stashFactoryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "VaultCreated") {
        const v = (ev.args as { vault: string }).vault.toLowerCase();
        if (!ns.vaults.includes(v)) ns.vaults.push(v);
        creationTxs.add(log.transactionHash);
      }
    } catch {
      // Not a factory event we care about.
    }
  }

  const alerts: Alert[] = [];
  const logs = ns.vaults.length ? await getLogsChunked(c, ns.vaults as Address[], from, to) : [];
  for (const log of logs) {
    const vault = (log.address as string).toLowerCase();
    if (vault === factory) continue;
    let ev;
    try {
      ev = decodeEventLog({ abi: stashVaultAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = ev.args as any;
    const push = (severity: Alert["severity"], html: string) => {
      if ((log.blockNumber as bigint) > BigInt(ns.quietUntil)) alerts.push({ network: key, vault, html, severity, block: log.blockNumber });
    };
    const where = `on ${net.chain.name} vault <code>${short(vault)}</code>`;
    switch (ev.eventName) {
      case "WithdrawalRequested":
        push(
          "warn",
          `⚠️ <b>Large withdrawal requested</b> ${where}\n${tokenAmount(key, a.token, a.amount)} to <code>${a.to}</code>\nLeaves after ${when(a.unlockAt)}.\n\nIf you don't recognise it, <b>stop it</b> before then.`,
        );
        break;
      case "GuardianAdded":
        if (creationTxs.has(log.transactionHash)) break;
        push("warn", `🛡️ <b>Guardian added</b> ${where}: <code>${a.guardian}</code>\nIf this wasn't the owner, an established guardian should remove it.`);
        break;
      case "GuardianRemovalProposed":
        push("warn", `⚠️ <b>Guardian removal requested</b> ${where}: <code>${a.guardian}</code>\nTakes effect ${when(a.effectiveAt)} unless a guardian keeps them.`);
        break;
      case "PolicyProposed":
        push(
          "warn",
          `⚠️ <b>Someone wants to loosen the limits</b> ${where}\nInstant limit → ${usd18(a.policy.dailyLimit)}/day, waiting period → ${Number(a.policy.timelock) / 3600}h.\nTakes effect ${when(a.effectiveAt)} unless a guardian blocks it.`,
        );
        break;
      case "YieldTargetProposed":
        push("warn", `⚠️ <b>New yield vault proposed</b> ${where}: <code>${a.adapter}</code>\nIf unexpected, a guardian should remove it before ${when(a.effectiveAt)}.`);
        break;
      case "Frozen":
        push("warn", `🧊 <b>Vault frozen</b> ${where} by <code>${short(a.by)}</code>. Nothing can leave until the owner and a guardian unfreeze it.`);
        break;
      case "Unfrozen":
        push("info", `✅ <b>Vault unfrozen</b> ${where}.`);
        break;
      case "WithdrawalCancelled":
        push("info", `🛑 Withdrawal #${a.id} cancelled ${where} by <code>${short(a.by)}</code>.`);
        break;
      case "AutoSaveAuthorized": {
        const source = (a.source as string).toLowerCase();
        if (!ns.autoSaves.some((p) => p.vault === vault && p.source === source)) ns.autoSaves.push({ vault, source });
        break;
      }
      case "AutoSaveRevoked": {
        const source = (a.source as string).toLowerCase();
        ns.autoSaves = ns.autoSaves.filter((p) => !(p.vault === vault && p.source === source));
        break;
      }
    }
  }
  ns.lastBlock = to.toString();
  return alerts;
}

/** Owner and guardians of a vault, lowercase. */
export async function stakeholders(key: NetworkKey, vault: string): Promise<string[]> {
  const c = client(key);
  const [owner, guardians] = await Promise.all([
    c.readContract({ address: vault as Address, abi: stashVaultAbi, functionName: "owner" }),
    c.readContract({ address: vault as Address, abi: stashVaultAbi, functionName: "guardians" }),
  ]);
  return [owner as string, ...(guardians as string[])].map((x) => x.toLowerCase());
}
