"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { erc20Abi, parseEventLogs, type Address, type Hex } from "viem";
import { clientFor, type Call } from "@/lib/chain";
import { stashEscrowAbi } from "@/lib/escrowAbi";
import { useSender } from "@/lib/useSender";
import { useEscrow } from "./EscrowShell";

/** Runs `load` on mount and whenever `key` changes; `reload` runs it again (after a transaction). */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ data?: T; error?: string; key?: string }>({});
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    loadRef
      .current()
      .then((data) => live && setState({ data, key }))
      .catch((e: Error) => {
        console.error(e);
        if (live) setState({ error: "Couldn't load this from the network. Refresh to try again.", key });
      });
    return () => {
      live = false;
    };
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = state.key === key;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, loading: !current, reload };
}

/** The signed-in person, their wallet, and a way to send escrow transactions on the escrow's network. */
export function useEscrowWallet() {
  const { net } = useEscrow();
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const sender = useSender();
  const me = authenticated ? sender.account : undefined;

  /** Sends calls in order; returns the escrow events from the last one, or undefined if it failed. */
  const send = useCallback(
    async (label: string, calls: Call[]) => {
      const hash = await sender.send(label, calls, net);
      if (!hash) return undefined;
      const receipt = await clientFor(net).getTransactionReceipt({ hash });
      return parseEventLogs({ abi: stashEscrowAbi, logs: receipt.logs });
    },
    [sender, net],
  );

  /** fetch() with the person's sign-in attached, for the escrow file routes. */
  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Sign in first.");
      return fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    },
    [getAccessToken],
  );

  /** Asks the server to email the other side about what just happened (sent once; failures are ignored). */
  const notify = useCallback(
    (deal: bigint) => {
      fetch("/api/escrow/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ net, deal: String(deal) }),
      }).catch(() => {});
    },
    [net],
  );

  return { ready, me, login, send, authFetch, notify, busy: sender.busy, error: sender.error, setError: sender.setError };
}

/** What the person's wallet holds on the escrow network: the stablecoin and gas money. */
export function useFunds(me: Address | undefined) {
  const { net, token, escrow } = useEscrow();
  return useLoad(async () => {
    if (!me) return null;
    const client = clientFor(net);
    const [balance, allowance, gas] = await Promise.all([
      client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [me] }),
      client.readContract({ address: token.address, abi: erc20Abi, functionName: "allowance", args: [me, escrow] }),
      client.getBalance({ address: me }),
    ]);
    return { balance, allowance, gas };
  }, `${net}:${me ?? ""}`);
}

/** Downloads a deal's delivered file through the gated route and saves it with its own name. */
export async function downloadDealFile(authFetch: (url: string) => Promise<Response>, net: string, deal: bigint) {
  const res = await authFetch(`/api/escrow/file?net=${net}&deal=${deal}`);
  if (!res.ok) throw new Error(await routeError(res));
  const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "delivery";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Reads a JSON error from one of our routes. */
export async function routeError(res: Response) {
  try {
    return ((await res.json()) as { error?: string }).error ?? `Request failed (${res.status}).`;
  } catch {
    return `Request failed (${res.status}).`;
  }
}

export type EscrowEvent = ReturnType<typeof parseEventLogs<typeof stashEscrowAbi>>[number];
export const idFrom = (events: EscrowEvent[] | undefined, name: "Listed" | "Funded") => {
  const e = events?.find((x) => x.eventName === name);
  if (!e) return undefined;
  const args = e.args as { listingId?: bigint; dealId?: bigint };
  return name === "Listed" ? args.listingId : args.dealId;
};

export type { Hex };
