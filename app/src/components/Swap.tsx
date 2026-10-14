"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { CHAINS, TOKENS, balanceOf, feesUsd, findToken, getQuote, tokenKey, walletOn, type Quote, type SwapToken } from "@/lib/swap";
import { useSwap } from "@/lib/useSwap";
import { MODE, askForMainnet } from "@/lib/config";
import { SwapIcon } from "./Icons";
import { btn, btnGhost, card, cardTitle, cleanAmount, input, textLink, tint } from "./ui";

// Left in a native-token balance so the wallet can still pay network fees after a "Max" swap.
const FEE_RESERVE: Record<string, bigint> = { "base:ETH": 300_000_000_000_000n, "solana:SOL": 5_000_000n };
const MIN_FEE_BALANCE = { base: 30_000_000_000_000n, solana: 3_000_000n }; // ~$0.10 of ETH, 0.003 SOL

const fmt = (v: bigint, t: SwapToken) =>
  Number(formatUnits(v, t.decimals)).toLocaleString(undefined, { maximumFractionDigits: t.decimals > 6 ? 6 : 2 });

/**
 * Swap major tokens between the user's own wallets on Tempo, Base and Solana (via Relay). Full page at
 * /swap; `embedded` renders it as a section of the Account tab.
 */
export default function Swap({ embedded }: { embedded?: boolean }) {
  const { preview, ready, wallets, quoteWallets, progress, error, result, swap, clearResult } = useSwap();
  const [fromKey, setFromKey] = useState("base:USDC");
  const [toKey, setToKey] = useState("tempo:pathUSD");
  const [amount, setAmount] = useState("");
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const from = findToken(fromKey);
  const to = findToken(toKey);

  const parsed = (() => {
    try {
      return amount ? parseUnits(amount, from.decimals) : 0n;
    } catch {
      return 0n;
    }
  })();

  // Balances for the chosen tokens, plus each origin chain's fee token.
  const refreshBalances = async () => {
    const needed = new Set([fromKey, toKey, "base:ETH", "solana:SOL"]);
    const entries = await Promise.all(
      [...needed].map(async (k) => {
        const t = findToken(k);
        const owner = walletOn(t.chain, wallets);
        return [k, owner ? await balanceOf(t, owner).catch(() => undefined) : undefined] as const;
      }),
    );
    const known = entries.filter((e): e is readonly [string, bigint] => e[1] !== undefined);
    setBalances((b) => ({ ...b, ...Object.fromEntries(known) }));
  };
  useEffect(() => {
    if (!wallets.evm) return;
    const t = setTimeout(() => refreshBalances().catch(() => {}), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKey, toKey, wallets.evm, wallets.solana]);

  // Live quote, debounced while typing; stale answers are ignored.
  useEffect(() => {
    if (parsed === 0n || fromKey === toKey) return;
    let live = true;
    const t = setTimeout(() => {
      setQuoting(true);
      getQuote(from, to, parsed, quoteWallets)
        .then((q) => live && (setQuote(q), setQuoteError(null)))
        .catch((e) => live && (setQuote(null), setQuoteError(e.message)))
        .finally(() => live && setQuoting(false));
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, fromKey, toKey, quoteWallets.evm, quoteWallets.solana]);

  const balance = balances[fromKey];
  const tooMuch = balance !== undefined && parsed > balance;
  const feeToken = from.chain === "base" ? "base:ETH" : from.chain === "solana" ? "solana:SOL" : null;
  const lowFees =
    feeToken !== null && balances[feeToken] !== undefined && balances[feeToken] < MIN_FEE_BALANCE[from.chain as "base" | "solana"];
  const showQuote = parsed > 0n && fromKey !== toKey;
  // Swaps only exist with real tokens (Relay has no testnet for Tempo or Solana), so in Testnet mode
  // quotes still show but the button asks to switch to Mainnet first.
  const testnet = MODE === "testnet";
  const canSwap = testnet || (ready && showQuote && !!quote && !quoting && !tooMuch && !progress);

  const pick = (setter: (k: string) => void) => (k: string) => {
    setter(k);
    setQuote(null);
    clearResult();
  };
  const flip = () => {
    setFromKey(toKey);
    setToKey(fromKey);
    setAmount("");
    setQuote(null);
    clearResult();
  };
  const max = () => {
    if (balance === undefined) return;
    const reserve = FEE_RESERVE[fromKey] ?? 0n;
    setAmount(formatUnits(balance > reserve ? balance - reserve : 0n, from.decimals));
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        {embedded ? (
          <h3 className={cardTitle}>Swap between chains</h3>
        ) : (
          <h1 className="text-3xl font-semibold leading-tight">Swap between chains</h1>
        )}
        <p className="text-sm text-muted">
          Move dollars, ETH, SOL or bitcoin between your own wallets on Tempo, Base and Solana. Routed by Relay; usually
          done in seconds.
        </p>
      </section>

      <section className={`${card} space-y-3`}>
        <TokenRow
          label="From"
          tokenKey={fromKey}
          onToken={pick(setFromKey)}
          balance={balance !== undefined ? `${fmt(balance, from)} ${from.symbol}` : undefined}
          onMax={balance !== undefined && balance > 0n ? max : undefined}
        >
          <input
            className={input}
            inputMode="decimal"
            placeholder="Amount"
            aria-label={`Amount of ${from.symbol} to swap`}
            value={amount}
            onChange={(e) => {
              setAmount(cleanAmount(e.target.value));
              clearResult();
            }}
          />
        </TokenRow>

        <div className="flex justify-center">
          <button className={`${btnGhost} grid w-11 place-items-center`} onClick={flip} aria-label="Swap direction">
            <SwapIcon width={18} height={18} className="rotate-90" />
          </button>
        </div>

        <TokenRow
          label="To"
          tokenKey={toKey}
          onToken={pick(setToKey)}
          balance={balances[toKey] !== undefined ? `${fmt(balances[toKey], to)} ${to.symbol}` : undefined}
        >
          <p className="min-h-11 rounded-xl border border-line bg-background px-3 py-3 text-muted" aria-live="polite">
            {!showQuote
              ? "—"
              : quoting && !quote
                ? "Finding a route…"
                : quote
                  ? `≈ ${Number(quote.details.currencyOut.amountFormatted).toLocaleString(undefined, { maximumFractionDigits: to.decimals > 6 ? 6 : 2 })} ${to.symbol}`
                  : "—"}
          </p>
        </TokenRow>

        {fromKey === toKey && <p className="text-sm text-warn-ink">Pick two different tokens.</p>}
        {showQuote && quote && (
          <p className="text-xs text-muted">
            Fees about ${feesUsd(quote).toFixed(2)} · arrives in ~{Math.max(quote.details.timeEstimate, 1)}s ·
            to your {CHAINS[to.chain].name} wallet
          </p>
        )}
        {showQuote && quoteError && !quoting && <p role="alert" className="text-sm text-danger-ink">{quoteError}</p>}
        {tooMuch && <p className="text-sm text-warn-ink">That&apos;s more than your {from.symbol} balance.</p>}
        {lowFees && (
          <p className={`rounded-lg px-3 py-2 text-xs ${tint.warn}`}>
            Your {CHAINS[from.chain].name} wallet needs a little {from.chain === "base" ? "ETH" : "SOL"} to pay the
            network fee.
          </p>
        )}
        {from.chain === "tempo" && (
          <p className="text-xs text-muted">Tempo has no gas token: the network fee (a fraction of a cent) is paid in dollars.</p>
        )}

        {testnet && (
          <p className={`rounded-lg px-3 py-2 text-xs ${tint.warn}`}>
            Swaps move real tokens: there&apos;s no test version. Switch to Mainnet to swap.
          </p>
        )}
        <button
          className={btn}
          disabled={!canSwap}
          onClick={async () => {
            if (testnet) return askForMainnet();
            const status = await swap(from, to, parsed);
            if (status === "success") setAmount("");
            refreshBalances().catch(() => {});
          }}
        >
          {progress
            ? `${progress}…`
            : testnet
              ? "Switch to mainnet to swap"
              : preview
                ? `Sign up to swap ${from.symbol} → ${to.symbol}`
                : `Swap ${from.symbol} → ${to.symbol}`}
        </button>

        {error && <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${tint.danger}`}>{error}</p>}
        {result && (
          <p role="status" className={`rounded-lg px-3 py-2 text-sm ${result.status === "success" ? tint.accent : tint.warn}`}>
            {result.status === "success"
              ? `Done. Your ${to.symbol} is in your ${CHAINS[to.chain].name} wallet.`
              : result.status === "refund"
                ? `The route couldn't complete, so your ${from.symbol} was refunded.`
                : "The swap didn't complete."}{" "}
            {result.requestId && (
              <a className="underline" href={`https://relay.link/transaction/${result.requestId}`} target="_blank" rel="noreferrer">
                Details
              </a>
            )}
          </p>
        )}
      </section>

      <section className="space-y-1 text-xs text-muted">
        <p>
          Swaps use your wallet balances, not your vault. Money in your vault stays behind its daily limit and waiting
          period; send it to your wallet first if you want to swap it.
        </p>
        <p>
          Real money on mainnet. Relay fronts the funds on the destination chain and settles with your deposit; Stash
          never holds your tokens. Prices move, so the amount you get can differ slightly from the estimate.
        </p>
      </section>
    </div>
  );
}

function TokenRow({
  label,
  tokenKey: key,
  onToken,
  balance,
  onMax,
  children,
}: {
  label: string;
  tokenKey: string;
  onToken: (k: string) => void;
  balance?: string;
  onMax?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted">
          {balance && <>Balance: {balance}</>}
          {onMax && (
            <button className={`${textLink} ml-2 min-h-0 py-2`} onClick={onMax}>
              Max
            </button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <select className={input} value={key} onChange={(e) => onToken(e.target.value)} aria-label={`${label} token`}>
          {(Object.keys(CHAINS) as (keyof typeof CHAINS)[]).map((c) => (
            <optgroup key={c} label={CHAINS[c].name}>
              {TOKENS.filter((t) => t.chain === c).map((t) => (
                <option key={tokenKey(t)} value={tokenKey(t)}>
                  {t.symbol} · {CHAINS[c].name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {children}
      </div>
    </div>
  );
}
