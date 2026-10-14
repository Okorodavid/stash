"use client";

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import type { useSavePot } from "@/lib/useSavePot";
import PotInfo from "./PotInfo";
import { useNow } from "@/lib/useNow";
import { useNotify } from "@/lib/notify";
import { btn, btnGhost, card, cardTitle, cleanAmount, input, tint, usd, waitAdj, type Loaded } from "./ui";
import { HOME_IS_SAVE } from "@/lib/config";
import { usePreview } from "@/lib/preview";
import { pct, useRates } from "@/lib/rates";

export default function SavePotCard({ home, pot }: { home: Loaded; pot: ReturnType<typeof useSavePot> }) {
  const { enabled, network, usdc, state, busy, error, actions } = pot;
  const [amount, setAmount] = useState("");
  const [out, setOut] = useState("");
  const now = useNow();
  const notify = useNotify();
  const { save: rate } = useRates();
  if (!enabled) return null;
  if (HOME_IS_SAVE) return <EarnCard pot={pot} />;

  const testnet = Boolean(network.chain.testnet);
  const title = (
    <div className="flex items-baseline justify-between">
      <h3 className={cardTitle}>Save pot</h3>
      <span className="text-xs text-muted">
        {typeof rate === "number" && <span className="font-semibold text-accent">{pct(rate)} a year · </span>}
        earns on {network.chain.name}
      </span>
    </div>
  );

  if (!state) return <section className={card}>{title}<p className="text-sm text-muted">Loading…</p></section>;

  const noGas = state.walletGas === 0n;
  const gasNote = noGas && (
    <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${tint.warn}`}>
      Your wallet needs a little {network.chain.nativeCurrency.symbol} on {network.chain.name} to pay network fees.
    </p>
  );

  if (!state.vault) {
    return (
      <section className={card}>
        {title}
        <p className="mt-1 text-sm text-muted">
          A second vault with the same rules and guardians, where your dollars earn interest. Wallet: {usd(state.walletUsdc, usdc.decimals)} {usdc.symbol}
        </p>
        {gasNote}
        <button className={`${btn} mt-3`} disabled={!!busy || noGas} onClick={() =>
            actions
              .createVault(home.state.guardians, BigInt(home.state.timelock), home.state.dailyLimitUsd)
              .then((h) => h && notify("Save pot opened, with the same rules and guardians as your vault."))
          }>
          Open Save pot
        </button>
        {busy && <p role="status" className="mt-2 text-sm">{busy}…</p>}
        {error && <p role="alert" className="mt-2 text-sm text-danger-ink">{error}</p>}
        <PotInfo pot="save" />
      </section>
    );
  }

  const total = state.idle + state.earning;
  const amt = Number(out || 0);
  const instant = amt > 0 && amt <= Number(formatUnits(state.allowanceUsd, 18)) && amt < Number(formatUnits(state.largeThresholdUsd, 18));
  const room = state.depositRoomUsd;
  const overCap = room !== null && Number(amount || 0) > Number(formatUnits(room, 18));

  return (
    <section className={card}>
      {title}
      <p className="text-3xl font-semibold">{usd(total, usdc.decimals)}</p>
      <p className="text-sm text-muted">
        {usd(state.earning, usdc.decimals)} earning · {usd(state.idle, usdc.decimals)} not earning
        {state.frozen && <span className="text-danger"> · frozen</span>}
      </p>
      {testnet && (
        <p className="mt-1 text-xs text-muted">Testnet stand-in vault (0% yield). On mainnet this is a curated Morpho USDC vault.</p>
      )}
      {gasNote}
      {busy && <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.accent}`}>{busy}…</p>}
      {error && <p role="alert" className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.danger}`}>{error}</p>}

      <p className="mt-3 text-sm">
        Add from wallet ({usd(state.walletUsdc, usdc.decimals)} {usdc.symbol})
        {room !== null && <span className="text-muted"> · beta limit: {usd(room, 18)} more</span>}
      </p>
      <div className="mt-1 flex gap-2">
        <input className={input} inputMode="decimal" placeholder="$ amount" aria-label="Amount to save and earn, in dollars" value={amount} onChange={(e) => setAmount(cleanAmount(e.target.value))} />
        <button
          className={btnGhost}
          disabled={!!busy || !amount || noGas || state.frozen || overCap}
          onClick={() =>
            actions.saveAndEarn(parseUnits(amount, usdc.decimals)).then((h) => {
              if (!h) return;
              notify(`$${amount} is now earning in your Save pot.`);
              setAmount("");
            })
          }
        >
          Save
        </button>
      </div>

      {state.earning > 0n && (
        <button
          className={`${btnGhost} mt-2 w-full`}
          disabled={!!busy || state.frozen}
          onClick={() => actions.stopEarning().then((h) => h && notify("Stopped earning. The money is ready to withdraw."))}
        >
          Stop earning so it can be withdrawn
        </button>
      )}

      {state.idle > 0n && (
        <>
          <p className="mt-3 text-sm">Withdraw to your wallet</p>
          <div className="mt-1 flex gap-2">
            <input className={input} inputMode="decimal" placeholder="$ amount" aria-label="Amount to withdraw to your wallet, in dollars" value={out} onChange={(e) => setOut(cleanAmount(e.target.value))} />
            <button
              className={btnGhost}
              disabled={!!busy || !out || state.frozen}
              onClick={() =>
                actions.withdrawToWallet(parseUnits(out, usdc.decimals), instant).then((h) => {
                  if (!h) return;
                  notify(instant ? `$${out} sent to your wallet.` : `$${out} is waiting ${waitAdj(state.timelock).replace("-", " ")}s. You or your guardians can cancel it.`, instant ? "ok" : "wait");
                  setOut("");
                })
              }
            >
              {instant || !out ? "Withdraw" : `Start ${waitAdj(state.timelock)} wait`}
            </button>
          </div>
        </>
      )}

      {state.pending.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {state.pending.map((p) => {
            const ready = now > 0 && now >= p.unlockAt;
            return (
              <li key={p.id.toString()} className="flex items-center justify-between gap-2">
                <span>
                  {usd(p.amount, usdc.decimals)} · {ready ? "ready" : `unlocks ${new Date(p.unlockAt * 1000).toLocaleString()}`}
                </span>
                <span className="flex gap-2">
                  {ready && (
                    <button
                      className={btnGhost}
                      disabled={!!busy}
                      aria-label={`Release ${usd(p.amount, usdc.decimals)}`}
                      onClick={() => actions.executeWithdrawal(p.id).then((h) => h && notify(`Released ${usd(p.amount, usdc.decimals)} to your wallet.`))}
                    >
                      Release
                    </button>
                  )}
                  <button
                    className={`${btnGhost} text-danger-ink`}
                    disabled={!!busy}
                    aria-label={`Cancel ${usd(p.amount, usdc.decimals)} withdrawal`}
                    onClick={() => actions.cancelWithdrawal(p.id).then((h) => h && notify(`Cancelled. ${usd(p.amount, usdc.decimals)} stays in your Save pot.`))}
                  >
                    Cancel
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <PotInfo pot="save" />
    </section>
  );
}

/**
 * Base as the home chain: the main account and the Save pot are the same Base vault, so "Save" is
 * just putting part of it to work in Morpho (and back). Money never leaves the vault's protection.
 */
function EarnCard({ pot }: { pot: ReturnType<typeof useSavePot> }) {
  const { usdc, state, busy, error, actions } = pot;
  const { preview } = usePreview();
  const notify = useNotify();
  const [amount, setAmount] = useState("");
  const { save: rate } = useRates();
  if (!state) return null;
  // Visitors and people without a vault see it too; the button then asks them to sign up / create one.
  let parsed = 0n;
  try {
    parsed = amount ? parseUnits(amount, usdc.decimals) : 0n;
  } catch {
    parsed = 0n;
  }
  return (
    <section className={card}>
      <div className="flex items-baseline justify-between">
        <h3 className={cardTitle}>Earn on your savings</h3>
        <span className="text-xs text-muted">
          {typeof rate === "number" && <span className="font-semibold text-accent">{pct(rate)} a year · </span>}
          Morpho on Base
        </span>
      </div>
      <p className="text-3xl font-semibold">{usd(state.earning, usdc.decimals)}</p>
      <p className="text-sm text-muted">
        earning · {usd(state.idle, usdc.decimals)} in your main account, not earning
        {state.frozen && <span className="text-danger"> · frozen</span>}
      </p>
      {busy && <p role="status" className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.accent}`}>{busy}…</p>}
      {error && <p role="alert" className={`mt-2 rounded-lg px-3 py-2 text-sm ${tint.danger}`}>{error}</p>}
      <div className="mt-3 flex gap-2">
        <input className={input} inputMode="decimal" placeholder="$ amount" aria-label="Amount to start earning on, in dollars" value={amount} onChange={(e) => setAmount(cleanAmount(e.target.value))} />
        <button
          className={btnGhost}
          disabled={!preview && (!!busy || parsed === 0n || parsed > state.idle || state.frozen || !state.adapter)}
          onClick={() =>
            actions.earnFromVault(parsed).then((h) => {
              if (!h) return;
              notify(`$${amount} is now earning. It stays behind your vault's limits and guardians.`);
              setAmount("");
            })
          }
        >
          Start earning
        </button>
      </div>
      {!preview && parsed > state.idle && <p className="mt-1 text-xs text-warn-ink">That&apos;s more than your main account holds.</p>}
      {state.earning > 0n && (
        <button
          className={`${btnGhost} mt-2 w-full`}
          disabled={!!busy || state.frozen}
          onClick={() => actions.stopEarning().then((h) => h && notify("Stopped earning. The money is back in your main account."))}
        >
          Stop earning (back to your main account)
        </button>
      )}
      <p className="mt-2 text-xs text-muted">Earning money stays in your vault, behind the same limits and guardians.</p>
      <PotInfo pot="save" />
    </section>
  );
}
