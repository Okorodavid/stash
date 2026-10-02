"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { erc20Abi, stashFactoryAbi, stashVaultAbi } from "./abis";
import { DEFAULT_POLICY, HOME, NETWORKS, type Token } from "./config";

export type Pending = {
  id: bigint;
  token: Address;
  to: Address;
  amount: bigint;
  unlockAt: number;
  guardianApproved: boolean;
};

export type VaultState = {
  vault: Address | null; // null = not created yet
  frozen: boolean;
  allowanceUsd: bigint; // 18 decimals
  largeThresholdUsd: bigint;
  timelock: number; // seconds
  guardians: Address[];
  balances: { token: Token; available: bigint; total: bigint; wallet: bigint }[];
  pending: Pending[];
};

const net = NETWORKS[HOME];
const publicClient = createPublicClient({ chain: net.chain, transport: http() });

export function useVault() {
  const { wallets, ready } = useWallets();
  const wallet = useMemo(() => wallets.find((w) => w.walletClientType === "privy") ?? wallets[0], [wallets]);
  const owner = wallet?.address as Address | undefined;

  const [state, setState] = useState<VaultState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!owner || !net.factory) return;
    const vault = await publicClient.readContract({
      address: net.factory,
      abi: stashFactoryAbi,
      functionName: "vaultOf",
      args: [owner],
    });
    const walletBalances = await Promise.all(
      net.tokens.map((t) =>
        publicClient.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
      ),
    );
    if (vault === zeroAddress) {
      setState({
        vault: null,
        frozen: false,
        allowanceUsd: 0n,
        largeThresholdUsd: DEFAULT_POLICY.largeThreshold,
        timelock: Number(DEFAULT_POLICY.timelock),
        guardians: [],
        balances: net.tokens.map((token, i) => ({ token, available: 0n, total: 0n, wallet: walletBalances[i] })),
        pending: [],
      });
      return;
    }
    // Loosely typed on purpose: the ABI is generated, and results are shaped right below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = (functionName: string, args: readonly unknown[] = []): Promise<any> =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient.readContract({ address: vault, abi: stashVaultAbi, functionName, args } as any);

    const [frozen, allowanceUsd, policy, guardians, nextId] = await Promise.all([
      read("frozen"),
      read("remainingDailyLimit"),
      read("policy"),
      read("guardians"),
      read("nextWithdrawalId"),
    ]);
    const balances = await Promise.all(
      net.tokens.map(async (token, i) => {
        const [available, total] = await Promise.all([
          read("available", [token.address]) as Promise<bigint>,
          publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [vault] }),
        ]);
        return { token, available, total, wallet: walletBalances[i] };
      }),
    );
    // Newest first; stop after the last 20 ids to keep this fast.
    const ids: bigint[] = [];
    for (let id = (nextId as bigint) - 1n; id >= 0n && ids.length < 20; id--) ids.push(id);
    const raw = await Promise.all(ids.map((id) => read("pendingWithdrawals", [id])));
    const pending: Pending[] = raw
      .map((p, i) => ({
        id: ids[i],
        token: p[0] as Address,
        unlockAt: Number(p[1]),
        to: p[2] as Address,
        amount: p[3] as bigint,
        guardianApproved: p[4] as boolean,
      }))
      .filter((p) => p.amount > 0n);

    setState({
      vault,
      frozen,
      allowanceUsd,
      largeThresholdUsd: policy[2],
      timelock: Number(policy[0]),
      guardians,
      balances,
      pending,
    });
  }, [owner]);

  useEffect(() => {
    refresh().catch((e) => setError(e.shortMessage ?? e.message));
    const t = setInterval(() => refresh().catch(() => {}), 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  /** Sends one or more contract calls in order from the user's embedded wallet. */
  const send = useCallback(
    async (label: string, calls: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }[]) => {
      if (!wallet || !owner) return;
      setBusy(label);
      setError(null);
      try {
        await wallet.switchChain(net.chain.id);
        const walletClient = createWalletClient({
          account: owner,
          chain: net.chain,
          transport: custom(await wallet.getEthereumProvider()),
        });
        let hash: Hash | undefined;
        for (const call of calls) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = encodeFunctionData(call as any);
          // Tempo's estimate undercounts its expensive new-storage writes (250k gas per slot),
          // so pad it; otherwise e.g. createVault runs out of gas.
          const estimate = await publicClient.estimateGas({ account: owner, to: call.address, data });
          // Read the nonce from the chain ourselves: Privy's own count can lag behind after a
          // reverted transaction (reverts still consume a nonce), causing "nonce too low".
          const nonce = await publicClient.getTransactionCount({ address: owner, blockTag: "pending" });
          hash = await walletClient.sendTransaction({ to: call.address, data, gas: (estimate * 3n) / 2n, nonce });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error(`${label} failed on-chain (tx ${hash}).`);
        }
        await refresh();
        return hash;
      } catch (e) {
        const err = e as { shortMessage?: string; message: string };
        setError(err.shortMessage ?? err.message);
      } finally {
        setBusy(null);
      }
    },
    [wallet, owner, refresh],
  );

  const vault = state?.vault ?? null;
  const v = (functionName: string, args: readonly unknown[]) => ({
    address: vault as Address,
    abi: stashVaultAbi,
    functionName,
    args,
  });

  const actions = {
    createVault: (guardians: Address[]) =>
      send("Creating your vault", [
        {
          address: net.factory as Address,
          abi: stashFactoryAbi,
          functionName: "createVault",
          args: [guardians, DEFAULT_POLICY],
        },
      ]),
    deposit: (token: Token, amount: bigint) =>
      send("Saving", [
        { address: token.address, abi: erc20Abi, functionName: "approve", args: [vault, amount] },
        v("deposit", [token.address, amount]),
      ]),
    withdraw: (token: Token, to: Address, amount: bigint) => send("Sending", [v("withdraw", [token.address, to, amount])]),
    requestWithdrawal: (token: Token, to: Address, amount: bigint) =>
      send("Starting 24h wait", [v("requestWithdrawal", [token.address, to, amount])]),
    executeWithdrawal: (id: bigint) => send("Releasing", [v("executeWithdrawal", [id])]),
    cancelWithdrawal: (id: bigint) => send("Cancelling", [v("cancelWithdrawal", [id])]),
    freeze: () => send("Freezing", [v("freeze", [])]),
    addGuardian: (g: Address) => send("Adding guardian", [v("addGuardian", [g])]),
  };

  return { ready, owner, network: net, configured: Boolean(net.factory), state, busy, error, refresh, actions };
}
