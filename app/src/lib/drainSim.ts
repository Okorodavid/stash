import { decodeErrorResult, encodeFunctionData, formatUnits, type Address, type Hex } from "viem";
import { stashVaultAbi } from "./abis";
import { net, publicClient, readVault } from "./chain";
import { STASH_GUARDIAN, type Token } from "./config";

// Drain simulation: replays a thief holding the owner key against a real vault with eth_simulateV1.
// Every call runs on Tempo's actual contract state, but nothing is signed or sent.

/** Where the thief sends money, and the guardian they try to plant. Placeholder addresses. */
export const THIEF_WALLET: Address = "0x000000000000000000000000000000000000dEaD";
const THIEF_GUARDIAN: Address = "0x0000000000000000000000000000000000000Bad";

export type Outcome = "blocked" | "lost" | "waiting" | "stopped" | "failed";

export type SimStep = {
  actor: "thief" | "guardian";
  later: boolean; // runs after the timelock has passed
  title: string;
  outcome: Outcome;
  detail: string;
  lost: bigint; // token units that reached the thief in this step
};

export type VaultSnapshot = {
  vault: Address;
  owner: Address;
  token: Token;
  balance: bigint;
  available: bigint; // not locked in goals
  instantCap: bigint; // most the owner key can take instantly right now
  timelock: number;
  frozen: boolean;
  guardians: Address[];
  responder: Address | null; // guardian who answers the alert in the simulation
  now: bigint;
  block: bigint;
};

export type SimResult = { steps: SimStep[]; lost: bigint; kept: bigint };

/** Plain-language reasons for the vault's revert errors. */
const REASONS: Record<string, string> = {
  AboveLargeThreshold: "Big amounts can't leave instantly.",
  DailyLimitExceeded: "Today's instant limit is used up.",
  InsufficientAvailable: "There's no unlocked money left to take.",
  UnknownWithdrawal: "That withdrawal was cancelled.",
  IsFrozen: "The vault is frozen. Nothing can leave.",
  NotAllowed: "Unfreezing needs approval from a guardian who has been on the vault for a full timelock.",
  NothingPending: "There's nothing waiting to apply. A guardian cancelled it.",
  StillLocked: "Still inside the waiting period.",
  LastGuardian: "A vault can't lose its last guardian.",
  TooManyGuardians: "The vault already has the maximum of 3 guardians.",
  InvalidGuardian: "That guardian change isn't allowed.",
};

const toUnits = (usd18: bigint, decimals: number) => usd18 / 10n ** BigInt(18 - decimals);
const dollars = (v: bigint, decimals: number) =>
  Number(formatUnits(v, decimals)).toLocaleString(undefined, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" });

/** Reads what a thief would be up against. */
export async function snapshot(vault: Address): Promise<VaultSnapshot> {
  const token = net.tokens[0];
  const read = (fn: string, args: readonly unknown[] = []) => readVault(vault, fn, args);
  const [block, owner, policy, remaining, available, frozen, guardians, balance] = await Promise.all([
    publicClient.getBlock(),
    read("owner") as Promise<Address>,
    read("policy"),
    read("remainingDailyLimit") as Promise<bigint>,
    read("available", [token.address]) as Promise<bigint>,
    read("frozen") as Promise<boolean>,
    read("guardians") as Promise<Address[]>,
    publicClient.readContract({
      address: token.address,
      abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }],
      functionName: "balanceOf",
      args: [vault],
    }),
  ]);
  const establishedAt = (await Promise.all(guardians.map((g) => read("guardianEstablishedAt", [g])))) as bigint[];
  const established = guardians.filter((_, i) => establishedAt[i] !== 0n && establishedAt[i] <= block.timestamp);
  const stash = established.find((g) => STASH_GUARDIAN && g.toLowerCase() === STASH_GUARDIAN.toLowerCase());
  // Instant withdrawals must be strictly below the large threshold.
  const belowThreshold = toUnits(policy[2] as bigint, token.decimals) - 1n;
  const allowance = toUnits(remaining, token.decimals);
  const instantCap = [allowance, available, belowThreshold].reduce((a, b) => (b < a ? b : a));
  return {
    vault,
    owner,
    token,
    balance,
    available,
    instantCap: instantCap > 0n ? instantCap : 0n,
    timelock: Number(policy[0]),
    frozen,
    guardians,
    responder: stash ?? established[0] ?? guardians[0] ?? null,
    now: block.timestamp,
    block: block.number,
  };
}

type Planned = {
  actor: SimStep["actor"];
  later?: boolean;
  title: string;
  from: Address;
  fn: string;
  args?: readonly unknown[];
  /** Outcome when the call succeeds. */
  ok: { outcome: Outcome; detail: string; lost?: bigint };
};

/** Runs the attack. `guardiansRespond` = a guardian acts on the alert before the timelock ends. */
export async function runDrain(s: VaultSnapshot, guardiansRespond: boolean): Promise<SimResult> {
  const { token, owner: thief } = s;
  const $ = (v: bigint) => dollars(v, token.decimals);
  const hours = s.timelock / 3600;
  const wait = hours >= 1 ? `${hours % 1 ? hours.toFixed(1) : hours}h` : `${Math.round(s.timelock / 60)} min`;
  const nextId = (await readVault(s.vault, "nextWithdrawalId")) as bigint;
  const rest = s.available - s.instantCap;
  const guardian = s.responder;
  const plantGuardian = s.guardians.length < 3;
  const targetGuardian = s.guardians.length > 1 ? guardian : null;

  const plan: Planned[] = [];
  if (rest > 0n) {
    plan.push({
      actor: "thief",
      title: `Sends all ${$(s.available)} to their own wallet`,
      from: thief,
      fn: "withdraw",
      args: [token.address, THIEF_WALLET, s.available],
      ok: { outcome: "lost", detail: "Everything left in one go.", lost: s.available },
    });
  }
  if (s.instantCap > 0n) {
    plan.push({
      actor: "thief",
      title: `Takes the instant maximum: ${$(s.instantCap)}`,
      from: thief,
      fn: "withdraw",
      args: [token.address, THIEF_WALLET, s.instantCap],
      ok: { outcome: "lost", detail: "Within today's instant limit, so it goes through.", lost: s.instantCap },
    });
  }
  if (rest > 0n && s.instantCap > 0n) {
    const again = rest < s.instantCap ? rest : s.instantCap;
    plan.push({
      actor: "thief",
      title: `Tries again for ${$(again)}`,
      from: thief,
      fn: "withdraw",
      args: [token.address, THIEF_WALLET, again],
      ok: { outcome: "lost", detail: "There was still room under the instant limit.", lost: again },
    });
  }
  if (rest > 0n) {
    plan.push({
      actor: "thief",
      title: `Queues a withdrawal of the other ${$(rest)}`,
      from: thief,
      fn: "requestWithdrawal",
      args: [token.address, THIEF_WALLET, rest],
      ok: { outcome: "waiting", detail: `Has to wait ${wait}. Guardians and the owner get a Telegram alert that opens the guardian page.` },
    });
  }
  const MIN_WAIT = 24 * 3600; // the contract's floor
  plan.push({
    actor: "thief",
    title:
      s.timelock > MIN_WAIT
        ? "Raises the limits to $1 billion and cuts the wait to 24 hours"
        : "Raises the limits to $1 billion",
    from: thief,
    fn: "proposePolicy",
    args: [{ timelock: BigInt(MIN_WAIT), dailyLimit: 10n ** 27n, largeThreshold: 10n ** 27n }],
    ok: { outcome: "waiting", detail: `Loosening the rules waits ${wait} too, so any guardian can cancel it.` },
  });
  if (plantGuardian) {
    plan.push({
      actor: "thief",
      title: "Adds a guardian they control",
      from: thief,
      fn: "addGuardian",
      args: [THIEF_GUARDIAN],
      ok: { outcome: "waiting", detail: `Allowed, because more guardians means more protection. But it can't help unfreeze for ${wait}, and an existing guardian can remove it.` },
    });
  }
  if (targetGuardian) {
    plan.push({
      actor: "thief",
      title: "Tries to remove an existing guardian",
      from: thief,
      fn: "proposeGuardianRemoval",
      args: [targetGuardian],
      ok: { outcome: "waiting", detail: `Removing a guardian also waits ${wait}.` },
    });
  }

  if (guardiansRespond && guardian && !s.frozen) {
    if (rest > 0n) {
      plan.push({
        actor: "guardian",
        title: `Cancels the ${$(rest)} withdrawal`,
        from: guardian,
        fn: "cancelWithdrawal",
        args: [nextId],
        ok: { outcome: "stopped", detail: "From the guardian page the alert links to." },
      });
    }
    plan.push({
      actor: "guardian",
      title: "Cancels the new limits",
      from: guardian,
      fn: "cancelPolicy",
      ok: { outcome: "stopped", detail: "The old limits stay in place." },
    });
    if (plantGuardian) {
      plan.push({
        actor: "guardian",
        title: "Removes the thief's guardian",
        from: guardian,
        fn: "vetoGuardian",
        args: [THIEF_GUARDIAN],
        ok: { outcome: "stopped", detail: "Guardians who were already on the vault can remove brand-new ones." },
      });
    }
    if (targetGuardian) {
      plan.push({
        actor: "guardian",
        title: "Cancels the guardian removal",
        from: guardian,
        fn: "cancelGuardianRemoval",
        args: [targetGuardian],
        ok: { outcome: "stopped", detail: "Every guardian stays on the vault." },
      });
    }
    plan.push({
      actor: "guardian",
      title: "Freezes the vault",
      from: guardian,
      fn: "freeze",
      ok: { outcome: "stopped", detail: "Nothing can leave until the owner and a guardian they've had for a while both agree." },
    });
  }

  // After the waiting period: the thief comes back to collect.
  if (rest > 0n) {
    plan.push({
      actor: "thief",
      later: true,
      title: `Collects the queued ${$(rest)}`,
      from: thief,
      fn: "executeWithdrawal",
      args: [nextId],
      ok: { outcome: "lost", detail: "Nobody cancelled it during the wait.", lost: rest },
    });
  }
  plan.push({
    actor: "thief",
    later: true,
    title: "Switches on the $1 billion limits",
    from: thief,
    fn: "applyPolicy",
    ok: { outcome: "lost", detail: "Nobody cancelled the change, so the new limits apply." },
  });
  if (guardiansRespond) {
    plan.push({
      actor: "thief",
      later: true,
      title: "Unfreezes the vault",
      from: thief,
      fn: "unfreeze",
      ok: { outcome: "lost", detail: "The vault is open again." },
    });
    if (s.instantCap > 0n) {
      plan.push({
        actor: "thief",
        later: true,
        title: "Waits for the daily limit to refill and tries again",
        from: thief,
        fn: "withdraw",
        args: [token.address, THIEF_WALLET, s.instantCap],
        ok: { outcome: "lost", detail: "The daily limit refilled.", lost: s.instantCap },
      });
    }
  }

  const call = (p: Planned) => ({
    from: p.from,
    to: s.vault,
    data: encodeFunctionData({ abi: stashVaultAbi, functionName: p.fn, args: p.args ?? [] } as never),
  });
  const now = plan.filter((p) => !p.later);
  const later = plan.filter((p) => p.later);
  const blocks = await publicClient.simulateBlocks({
    validation: false, // no signatures or fees: the thief's key is simulated
    blocks: [
      { calls: now.map(call) },
      { blockOverrides: { time: s.now + BigInt(s.timelock) + 60n }, calls: later.map(call) },
    ],
  });
  const results = blocks.flatMap((b) => b.calls);

  const steps = plan.map((p, i): SimStep => {
    const r = results[i];
    if (r.status === "success") return { actor: p.actor, later: !!p.later, title: p.title, lost: 0n, ...p.ok };
    const name = errorName(r.data as Hex);
    return {
      actor: p.actor,
      later: !!p.later,
      title: p.title,
      // A failed guardian action is a real problem; a failed thief action is the vault doing its job.
      outcome: p.actor === "thief" ? "blocked" : "failed",
      detail: REASONS[name] ?? `The vault refused (${name}).`,
      lost: 0n,
    };
  });
  const lost = steps.reduce((sum, st) => sum + st.lost, 0n);
  return { steps, lost, kept: s.balance - lost };
}

function errorName(data: Hex | undefined) {
  try {
    return decodeErrorResult({ abi: stashVaultAbi, data: data ?? "0x" }).errorName;
  } catch {
    return "unknown error";
  }
}
