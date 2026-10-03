// Growth pot plumbing: Solana mainnet, Reflect's Protected (senior) tranche, Jupiter swaps.
// Plain fetch calls (Reflect and Jupiter both allow browser CORS); no server needed.

export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
export const SOLANA_CHAIN = "solana:mainnet" as const;

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** Reflect "Protected Earn Hylo USD": senior tranche of Hylo's sHYUSD. */
export const TRANCHE = {
  name: "Protected Earn Hylo USD",
  whitelabelId: "DHEFndu3LxDkuQSzxz5HQ1N2UEm2c6evRzRSsyLL8S7i",
  seniorMint: "SRcbNRqXP585fbxMNo2NkCbrgjZNZv9y8JMcwXonUap",
  baseMint: "HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz", // sHYUSD
  decimals: 6,
} as const;

/** Beta cap per deposit while the app is unaudited. */
export const GROWTH_DEPOSIT_CAP_USD = Number(process.env.NEXT_PUBLIC_GROWTH_CAP_USD || 25);

const REFLECT = "https://prod.api.reflect.money";
const JUPITER = "https://lite-api.jup.ag/swap/v1";
const SLIPPAGE_BPS = 50;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "Solana RPC error");
  return json.result as T;
}

async function reflect<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${REFLECT}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || json.success === false || json.error) throw new Error(json.error?.message ?? json.error ?? "Reflect API error");
  return json.data as T;
}

/** Raw token amount (smallest units) the owner holds of a mint. */
export async function tokenBalance(owner: string, mint: string): Promise<bigint> {
  const r = await rpc<{ value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }>(
    "getTokenAccountsByOwner",
    [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
  );
  return r.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
}

export async function solBalance(owner: string): Promise<bigint> {
  const r = await rpc<{ value: number }>("getBalance", [owner, { commitment: "confirmed" }]);
  return BigInt(r.value);
}

/** Live tranche numbers: APY and the USD value of one senior token. */
export async function trancheStats() {
  const s = await reflect<{ apy_bps: number; exchange_rate_usdc: string }>(`/tranches/senior/${TRANCHE.whitelabelId}/stats`);
  return { apyBps: s.apy_bps, usdPerToken: Number(s.exchange_rate_usdc) / 10_000 };
}

export async function quoteTranche(type: "mint" | "redeem", amount: bigint): Promise<bigint> {
  const out = await reflect<number>(`/tranches/senior/quote/${type}`, { whitelabelId: TRANCHE.whitelabelId, amount: Number(amount) });
  return BigInt(out);
}

/** Unsigned transaction (base64) depositing `amount` sHYUSD into the Protected tranche. */
export async function trancheMintTx(owner: string, amount: bigint, minimumReceived: bigint) {
  const d = await reflect<{ transaction: string }>("/tranches/senior/mint", {
    whitelabelId: TRANCHE.whitelabelId,
    amount: Number(amount),
    minimumReceived: Number(minimumReceived),
    recipient: owner,
    feePayer: owner,
  });
  return d.transaction;
}

/** Unsigned transaction (base64) redeeming `amount` Protected tokens back to sHYUSD. */
export async function trancheRedeemTx(owner: string, amount: bigint, minimumReceived: bigint) {
  const d = await reflect<{ transaction: string }>("/tranches/senior/redeem", {
    whitelabelId: TRANCHE.whitelabelId,
    amount: Number(amount),
    minimumReceived: Number(minimumReceived),
    recipient: owner,
    feePayer: owner,
  });
  return d.transaction;
}

type JupQuote = { outAmount: string; otherAmountThreshold: string; priceImpactPct: string };

export async function jupiterQuote(inputMint: string, outputMint: string, amount: bigint): Promise<JupQuote> {
  const url = `${JUPITER}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${SLIPPAGE_BPS}`;
  const q = await (await fetch(url)).json();
  if (!q.outAmount) throw new Error(q.error ?? "No swap route found");
  return q;
}

/** Unsigned swap transaction (base64) for a Jupiter quote. */
export async function jupiterSwapTx(quote: JupQuote, owner: string): Promise<string> {
  const res = await fetch(`${JUPITER}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: owner, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }),
  });
  const json = await res.json();
  if (!json.swapTransaction) throw new Error(json.error ?? "Could not build swap");
  return json.swapTransaction;
}

/** Waits until a signature is confirmed; throws if the transaction failed. */
export async function confirmSignature(signature: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await rpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>("getSignatureStatuses", [[signature]]);
    const s = r.value[0];
    if (s?.err) throw new Error("Transaction failed on Solana");
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("Timed out waiting for Solana confirmation");
}

export const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
