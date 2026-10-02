# Stash

A dollar savings app that a stolen key can't drain. Built for Colosseum's Crypto World's Fair (Tempo track, with Base and Solana integrations).

- **Tempo**: main dollar account (OUSD) in a per-user `StashVault`
- **Base**: "Save" pot, same vault, earning in a curated Morpho vault
- **Solana**: "Growth" pot in Reflect's Protected (senior) tranche

See [PLAN.md](PLAN.md) for the full build plan.

## How the vault protects savings

| Threat | What the vault does |
|---|---|
| Stolen login / owner key | Instant withdrawals capped by a daily allowance that refills gradually (no "midnight reset" double-dip). Anything larger waits out a timelock. |
| Thief queues a big withdrawal | Any guardian (Stash, the user's second phone, a trusted person) can cancel it or freeze the vault. |
| Thief loosens the rules | Raising limits, shortening the timelock, removing a guardian, or adding a yield adapter is itself timelocked; guardians can cancel. |
| Thief plants their own guardian | New guardians can cancel/freeze immediately but only help *unfreeze* after a full timelock, and an established guardian can veto them. |
| Malicious approval / arbitrary call | The vault has no generic `call`/`execute` and no user-chosen approvals. The only approval it ever makes is to an allowlisted ERC-4626 adapter, reset to zero after each deposit. |
| Stash disappears | No guardian approval is ever *required*. The owner can always withdraw: instantly within the allowance, the rest after the timelock, using the static [exit page](exit/index.html). |
| Stash admin goes rogue | The factory owner can only change where goal break fees go. No function lets anyone but the vault owner move funds. |

Unaudited hackathon code. Deposits are capped during the beta.

## Repo layout

```
contracts/   Foundry project: StashVault, StashFactory, tests, deploy script
app/         Next.js 16 PWA (Privy login, Tempo/Base/Solana)
exit/        Stand-alone exit page (no backend; public RPC + browser wallet)
```

## Contracts

Requires [Foundry](https://getfoundry.sh).

```bash
cd contracts
forge test
```

Deploy (same script for every EVM chain):

```bash
export FACTORY_OWNER=0x...        # multisig in production
export TREASURY=0x...             # receives early-break fees
export DEFAULT_YIELD_TARGETS=0x... # optional: curated Morpho vault (Base)
forge script script/Deploy.s.sol --rpc-url moderato --broadcast --account deployer
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --account deployer
```

On Tempo there is no native gas token: the deployer pays fees in a USD stablecoin (pathUSD from the [faucet](https://tempo.xyz/developers/docs/quickstart/faucet) on testnet).

## License

MIT
