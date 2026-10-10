// Auto-save keeper: triggers due pullAutoSave calls. Anyone may call pullAutoSave; the vault
// enforces amount, timing and destination, so this key can never move funds anywhere else.
import { createWalletClient, encodeFunctionData, fallback, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { stashVaultAbi } from "../src/lib/abis.ts";
import { NETWORKS, RPC_URLS, type NetworkKey } from "../src/lib/config.ts";
import type { NetworkState } from "./store.ts";
import { client, type Alert } from "./watch.ts";

const KEY = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
const account = KEY ? privateKeyToAccount(KEY) : null;

export const keeperAddress = () => account?.address ?? null;

export async function runDue(key: NetworkKey, ns: NetworkState, notified: string[]): Promise<Alert[]> {
  if (!account) return [];
  const c = client(key);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const alerts: Alert[] = [];
  const wallet = createWalletClient({ account, chain: NETWORKS[key].chain, transport: fallback([...RPC_URLS[key].map((u) => http(u)), http()]) });

  for (const plan of [...ns.autoSaves]) {
    const vault = plan.vault as Address;
    const source = plan.source as Address;
    const p = (await c.readContract({ address: vault, abi: stashVaultAbi, functionName: "autoSaves", args: [source] })) as readonly [
      string,
      bigint,
      number,
      bigint,
      bigint,
    ];
    const nextAt = p[4];
    if (nextAt === 0n) {
      ns.autoSaves = ns.autoSaves.filter((x) => x !== plan); // revoked
      continue;
    }
    if (nextAt > now) continue;

    const data = encodeFunctionData({ abi: stashVaultAbi, functionName: "pullAutoSave", args: [source] });
    try {
      // Simulate first: no fee is spent on a pull that would fail (e.g. source has no funds).
      const gas = await c.estimateGas({ account: account.address, to: vault, data });
      const hash = await wallet.sendTransaction({ to: vault, data, gas: (gas * 3n) / 2n });
      const receipt = await c.waitForTransactionReceipt({ hash });
      console.log(`[${key}] auto-save ${vault} <- ${source}: ${receipt.status} ${hash}`);
    } catch (e) {
      const dedupe = `autosave-fail:${key}:${vault}:${source}:${nextAt}`;
      if (!notified.includes(dedupe)) {
        notified.push(dedupe);
        alerts.push({
          network: key,
          vault,
          severity: "info",
          html: `ℹ️ <b>Auto-save skipped</b> on ${NETWORKS[key].chain.name}: the paying wallet <code>${source}</code> doesn't have enough funds or allowance right now. It'll try again next time.`,
        });
      }
      console.warn(`[${key}] auto-save ${vault} <- ${source} not possible:`, (e as Error).message.split("\n")[0]);
    }
  }
  return alerts;
}
