import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { stashFactoryAbi, stashVaultAbi } from "./abis";
import { tempoModerato } from "viem/chains";
import { HOME, NETWORKS, type NetworkKey } from "./config";

export const net = NETWORKS[HOME];

const clients = new Map<NetworkKey, PublicClient>();
/** One cached read client per network. */
export function clientFor(key: NetworkKey): PublicClient {
  let c = clients.get(key);
  if (!c) {
    c = createPublicClient({ chain: NETWORKS[key].chain, transport: http() }) as PublicClient;
    clients.set(key, c);
  }
  return c;
}

/** Read client for the home network (Tempo). */
export const publicClient = clientFor(HOME);

export type Call = { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] };
/** A prebuilt transaction (e.g. from a swap router): calldata as given, optional native value. */
export type RawTx = { to: Address; data: Hex; value?: bigint };

export type Pending = {
  id: bigint;
  token: Address;
  to: Address;
  amount: bigint;
  unlockAt: number;
  guardianApproved: boolean;
};

/** Loosely typed vault read: the ABI is generated, and callers shape the results. */
export function readVault(vault: Address, functionName: string, args: readonly unknown[] = [], key: NetworkKey = HOME) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return clientFor(key).readContract({ address: vault, abi: stashVaultAbi, functionName, args } as any) as Promise<any>;
}

export const vaultCall = (vault: Address, functionName: string, args: readonly unknown[] = []): Call => ({
  address: vault,
  abi: stashVaultAbi,
  functionName,
  args,
});

/** Newest-first queued withdrawals that are still pending (scans the last 20 ids). */
export async function readPending(vault: Address, nextId: bigint, key: NetworkKey = HOME): Promise<Pending[]> {
  const ids: bigint[] = [];
  for (let id = nextId - 1n; id >= 0n && ids.length < 20; id--) ids.push(id);
  const raw = await Promise.all(ids.map((id) => readVault(vault, "pendingWithdrawals", [id], key)));
  return raw
    .map((p, i) => ({
      id: ids[i],
      token: p[0] as Address,
      unlockAt: Number(p[1]),
      to: p[2] as Address,
      amount: p[3] as bigint,
      guardianApproved: p[4] as boolean,
    }))
    .filter((p) => p.amount > 0n);
}

/**
 * Dollars (18 decimals) a vault can still take in under its factory's beta deposit cap.
 * null = no cap (or a factory deployed before the cap existed).
 */
export async function depositRoom(factory: Address, vault: Address | null, key: NetworkKey = HOME): Promise<bigint | null> {
  const client = clientFor(key);
  const cap = await client
    .readContract({ address: factory, abi: stashFactoryAbi, functionName: "depositCapUsd" })
    .catch(() => 0n);
  if (cap === 0n) return null;
  const used = vault ? ((await readVault(vault, "netDepositedUsd", [], key).catch(() => 0n)) as bigint) : 0n;
  return cap > used ? cap - used : 0n;
}

/** A vault's owner-key move: each side's choice and any queued move. */
export type OwnerMove = {
  ownerNominee: Address | null;
  /** Each guardian's choice (only guardians that named someone). */
  guardianNominees: { guardian: Address; nominee: Address }[];
  pendingOwner: Address | null;
  pendingOwnerAt: number; // 0 = none queued
};

/** null when the vault predates owner moves (created by an older factory). */
export async function readOwnerMove(vault: Address, guardians: Address[], key: NetworkKey = HOME): Promise<OwnerMove | null> {
  const zero = "0x0000000000000000000000000000000000000000";
  try {
    const [ownerNominee, pendingOwner, pendingOwnerAt, ...picks] = (await Promise.all([
      readVault(vault, "ownerNominee", [], key),
      readVault(vault, "pendingOwner", [], key),
      readVault(vault, "pendingOwnerAt", [], key),
      ...guardians.map((g) => readVault(vault, "guardianNominee", [g], key)),
    ])) as [Address, Address, bigint, ...Address[]];
    return {
      ownerNominee: ownerNominee === zero ? null : ownerNominee,
      guardianNominees: guardians.map((guardian, i) => ({ guardian, nominee: picks[i] })).filter((g) => g.nominee !== zero),
      pendingOwner: pendingOwner === zero ? null : pendingOwner,
      pendingOwnerAt: Number(pendingOwnerAt),
    };
  } catch {
    return null;
  }
}

/** Tempo testnet has a public faucet; nowhere else gets free money. */
export const HAS_TEST_FAUCET = net.chain.id === tempoModerato.id;

/**
 * Tempo testnet only: the public faucet sends free test pathUSD (which pays network fees) and test
 * OUSD to `address`. New testers otherwise can't even pay the fee to create a vault.
 */
export async function fundFromTestFaucet(address: Address) {
  if (!HAS_TEST_FAUCET) throw new Error("There's no test faucet on this network.");
  const res = await fetch(net.chain.rpcUrls.default.http[0], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tempo_fundAddress", params: [address] }),
  });
  const json = (await res.json()) as { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? "The test faucet didn't respond. Try again in a minute.");
}
