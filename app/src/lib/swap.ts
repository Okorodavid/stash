import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createSolanaRpc,
  createTransactionMessage,
  fetchAddressesForLookupTables,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { erc20Abi, zeroAddress, type Address, type Hex } from "viem";
import { clientFor } from "./chain";
import type { NetworkKey } from "./config";
import { SOLANA_RPC, solBalance, tokenBalance } from "./growth";

// Cross-chain swaps between the user's own wallets on Tempo, Base and Solana, routed by Relay
// (relay.link). Mainnet only: Relay's testnet service doesn't cover Tempo or Solana.

const RELAY = "https://api.relay.link";

export type SwapChain = "tempo" | "base" | "solana";

export const CHAINS: Record<SwapChain, { name: string; relayId: number; evm?: NetworkKey }> = {
  tempo: { name: "Tempo", relayId: 4217, evm: "tempo" },
  base: { name: "Base", relayId: 8453, evm: "base" },
  solana: { name: "Solana", relayId: 792703809 },
};

export type SwapToken = { chain: SwapChain; symbol: string; address: string; decimals: number; native?: boolean };

/** Major tokens per chain (addresses as Relay lists them). */
export const TOKENS: SwapToken[] = [
  { chain: "tempo", symbol: "OUSD", address: "0x20c0000000000000000000006a37da5c996874be", decimals: 6 },
  { chain: "tempo", symbol: "USDC", address: "0x20c000000000000000000000b9537d11c60e8b50", decimals: 6 },
  { chain: "tempo", symbol: "USDT0", address: "0x20c00000000000000000000014f22ca97301eb73", decimals: 6 },
  { chain: "tempo", symbol: "pathUSD", address: "0x20c0000000000000000000000000000000000000", decimals: 6 },
  { chain: "base", symbol: "ETH", address: zeroAddress, decimals: 18, native: true },
  { chain: "base", symbol: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 },
  { chain: "base", symbol: "USDT", address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", decimals: 6 },
  { chain: "base", symbol: "cbBTC", address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", decimals: 8 },
  { chain: "solana", symbol: "SOL", address: "11111111111111111111111111111111", decimals: 9, native: true },
  { chain: "solana", symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  { chain: "solana", symbol: "USDT", address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  { chain: "solana", symbol: "OUSD", address: "ousd2mJsPEckLHcSCDxyKD7NDGARZcfLbDZkKiatYHB", decimals: 6 },
];

export const tokenKey = (t: SwapToken) => `${t.chain}:${t.symbol}`;
export const findToken = (key: string) => TOKENS.find((t) => tokenKey(t) === key)!;

/** The user's own wallet on each chain: one EVM address (Tempo + Base) and one Solana address. */
export type Wallets = { evm?: Address; solana?: string };
export const walletOn = (chain: SwapChain, w: Wallets) => (chain === "solana" ? w.solana : w.evm);

export async function balanceOf(t: SwapToken, owner: string): Promise<bigint> {
  if (t.chain === "solana") return t.native ? solBalance(owner) : tokenBalance(owner, t.address);
  const client = clientFor(CHAINS[t.chain].evm!);
  if (t.native) return client.getBalance({ address: owner as Address });
  return client.readContract({ address: t.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner as Address] });
}

type EvmTx = { from: Address; to: Address; data: Hex; value: string; chainId: number; gas?: string };
type SolIx = { programId: string; keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };
type SolTx = { instructions: SolIx[]; addressLookupTableAddresses?: string[] };
export type QuoteStep = {
  id: string;
  kind: "transaction" | "signature";
  requestId?: string;
  items: { status: string; data: EvmTx | SolTx; check?: { endpoint: string } }[];
};
export type Quote = {
  steps: QuoteStep[];
  details: {
    currencyIn: { amountFormatted: string; amountUsd: string };
    currencyOut: { amount: string; amountFormatted: string; amountUsd: string; minimumAmount?: string };
    totalImpact?: { usd: string; percent: string };
    timeEstimate: number;
  };
  fees: Record<string, { amountUsd?: string } | undefined>;
};

/** Relay quote for swapping `amount` of `from` into `to`, from and to the user's own wallets. */
export async function getQuote(from: SwapToken, to: SwapToken, amount: bigint, wallets: Wallets): Promise<Quote> {
  const user = walletOn(from.chain, wallets);
  const recipient = walletOn(to.chain, wallets);
  if (!user || !recipient) throw new Error("Your wallet for this chain isn't ready yet.");
  const res = await fetch(`${RELAY}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user,
      recipient,
      originChainId: CHAINS[from.chain].relayId,
      destinationChainId: CHAINS[to.chain].relayId,
      originCurrency: from.address,
      destinationCurrency: to.address,
      amount: amount.toString(),
      tradeType: "EXACT_INPUT",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "No route for this swap right now.");
  return json as Quote;
}

/** Total fees in USD as Relay reports them (gas + relayer + app). */
export const feesUsd = (q: Quote) =>
  Object.values(q.fees).reduce((sum, f) => sum + Number(f?.amountUsd ?? 0), 0);

export const isEvmTx = (d: EvmTx | SolTx): d is EvmTx => "to" in d;

const solRpc = createSolanaRpc(SOLANA_RPC);
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
const role = (k: SolIx["keys"][number]) =>
  k.isSigner
    ? k.isWritable
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER
    : k.isWritable
      ? AccountRole.WRITABLE
      : AccountRole.READONLY;

/** Builds an unsigned v0 Solana transaction from Relay's instructions, paid by `feePayer`. */
export async function buildSolanaTx(data: SolTx, feePayer: string): Promise<Uint8Array> {
  const instructions = data.instructions.map((ix) => ({
    programAddress: address(ix.programId),
    accounts: ix.keys.map((k) => ({ address: address(k.pubkey), role: role(k) })),
    data: fromHex(ix.data),
  }));
  const [tables, { value: blockhash }] = await Promise.all([
    fetchAddressesForLookupTables((data.addressLookupTableAddresses ?? []).map(address), solRpc),
    solRpc.getLatestBlockhash().send(),
  ]);
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(feePayer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
    (m) => compressTransactionMessageUsingAddressLookupTables(m, tables),
  );
  return new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
}

export type FillStatus = "waiting" | "pending" | "success" | "failure" | "refund";

/** Polls Relay until the swap fills (or fails / is refunded). */
export async function waitForFill(endpoint: string, onUpdate: (s: FillStatus) => void, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${RELAY}${endpoint}`).catch(() => null);
    const status = (res?.ok ? ((await res.json()) as { status?: FillStatus }).status : undefined) ?? "pending";
    onUpdate(status);
    if (status === "success" || status === "failure" || status === "refund") return status;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("The swap is taking longer than usual. Check your balance in a few minutes.");
}
