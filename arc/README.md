# Stash on Arc

USDC savings on [Arc](https://arc.io) that a stolen key or seed phrase can't drain.

This is a standalone build of [Stash](../README.md) for Arc mainnet only. It uses the same vault contracts as the main
app (`../contracts`, unaudited, covered by unit tests), deployed on Arc. Arc's USDC is the gas token too, so a saver only
ever holds one token.

## What it does

- **Instant up to a daily limit.** Small sends go out right away, up to a limit the owner picks (e.g. $100/day).
- **Bigger withdrawals wait.** Anything over the limit waits 24 hours or longer (the owner chooses). The owner or
  any guardian can cancel it during the wait.
- **Guardians.** 1 to 3 guardians (a second device, a trusted person, the Stash guardian). They can stop a
  withdrawal or freeze the vault. They can never move the money.
- **Freeze.** One hold-to-confirm button stops everything until a guardian approves unfreezing.
- **Earn.** USDC in the vault can earn through [Galaxy USDC](https://explorer.arc.io/address/0x8E357432CC12ff425c36432F312968aEb16112AF),
  a curated Morpho vault on Arc. The shares stay inside the Stash vault, behind the same limits and guardians.
- **Savings goals.** Lock money until a date. Breaking a goal early costs a small fee.
- **Drain test.** `/drain` runs a simulated thief against a real vault on Arc (read-only, nothing is sent).
- **Email or Google sign-in** (Privy embedded wallet), or bring your own wallet.

## Contracts (Arc mainnet, chain id 5042)

| | Address |
|---|---|
| StashFactory | [`0xCf97969137d1DEbf884e769b03C0AEEEF777F4BF`](https://repo.sourcify.dev/5042/0xCf97969137d1DEbf884e769b03C0AEEEF777F4BF) (source verified) |
| StashVault implementation | [`0x8fd2Df26DC45B41E82a0F6016c795550Fc1e8528`](https://repo.sourcify.dev/5042/0x8fd2Df26DC45B41E82a0F6016c795550Fc1e8528) (source verified) |
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000` |
| Default yield vault (Galaxy USDC, Morpho) | `0x8E357432CC12ff425c36432F312968aEb16112AF` |

Each user gets their own vault: a minimal clone created by the factory at a predictable address. The factory owner
can only change the beta deposit cap ($5,000 per vault) and where goal-break fees go. It has no way to touch money
in any vault.

Deploy (from `../contracts`):

```bash
FACTORY_OWNER=<owner> TREASURY=<treasury> DEPOSIT_CAP_USD=5000 \
DEFAULT_YIELD_TARGETS=0x8E357432CC12ff425c36432F312968aEb16112AF \
forge script script/Deploy.s.sol --rpc-url https://rpc.mainnet.arc.io --account <keystore> --broadcast
```

## Run the app

```bash
cp .env.example .env.local   # then fill in the Privy app id and the factory address
npm install
npm run dev
```

## Notes on Arc

- Native USDC has 18 decimals; the same balance is an ERC-20 at `0x3600…0000` with 6 decimals. The vault holds
  the ERC-20.
- Fees are paid in USDC, so the app warns before a save that would leave the wallet without a few cents for fees.
- Arc's USDC calls Arc-only precompiles (blocklist, native transfer) that Foundry's local EVM doesn't have, so
  vault flows on Arc are checked on mainnet with small amounts rather than on a local fork.
