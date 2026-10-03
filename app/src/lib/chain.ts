import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { stashVaultAbi } from "./abis";
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
