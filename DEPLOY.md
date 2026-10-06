# Mainnet deploy runbook

Tempo mainnet (home vault, OUSD) and Base mainnet (Save pot, Morpho). Every step before "Broadcast" is free and can be repeated.

## Decisions

| | Choice | Why |
|---|---|---|
| Save pot vault (Base) | **Gauntlet USDC Prime**, Morpho V1, [`0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61`](https://app.morpho.org/base/vault/0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61) | Largest listed USDC vault on Base (~$414M on Oct 5, 2026), 0% fee, ~4.4% net APY, live since Jun 2024. Lends only against cbBTC (~91%) and WETH (~8%); no bad debt in its markets; 7-day curator timelock. |
| Deposit cap | `DEPOSIT_CAP_USD` per vault, e.g. **500** | On-chain, set on each factory. Counts dollars deposited minus dollars sent out; yield doesn't count. The factory owner can raise, lower or remove it (`setDepositCap`); it can only block new deposits. |
| Waiting period | Owner's choice, **24 hours to 30 days** | Enforced by the contract (`MIN_TIMELOCK = 24 hours`). Lengthening applies at once; shortening waits out the current period and guardians can cancel it. |
| Factory owner + treasury | **A Safe on each chain** | Safe 1.4.1 contracts are deployed on both Tempo and Base. |
| Deployer | **A fresh key, used once** | Not the testnet key `0x2f24…6094`, which is also a guardian on testnet vaults. |

Other candidates that passed the same fork test: Spark USDC (V1, `0x7BfA…F34A`), Steakhouse Prime USDC (V1 `0xBEEF…83b2`, V2 `0xbeef…73C9`), Steakhouse USDC (V1 `0xbeeF…8183`), Gauntlet USDC Prime (V2 `0x050c…56f0`).

## 1. Checks (free)

```bash
cd contracts
forge test                                                       # 42 unit tests
BASE_RPC_URL=https://mainnet.base.org forge test --match-contract MorphoForkTest -vv
```

The fork test runs the real `StashVault` against each candidate on a copy of Base mainnet: deposit, share pricing against the limits, a week of interest, redeem.

## 2. Safes (owner + treasury)

1. Create a Safe on **Base** at [app.safe.global](https://app.safe.global). Suggested: 2-of-3 signers (e.g. your phone wallet, a hardware wallet, a co-founder or trusted backup).
2. Create a Safe on **Tempo** (chain id 4217). The Safe 1.4.1 factory is deployed there. Check that app.safe.global lists Tempo; if it doesn't, the deploy can still name a Safe created with the canonical factory, but you'd need another interface to sign transactions from it. Fallback: a single dedicated key as owner on Tempo, disclosed in the README.
3. Note both addresses. Each Safe is both `FACTORY_OWNER` and `TREASURY` on its chain.

## 3. Deployer key

```bash
cast wallet new                               # write down the address; never reuse this key for anything else
cast wallet import mainnet-deployer --interactive   # paste the private key, set a password
```

Fund it:
- **Base:** ~0.0005 ETH. The dry run needs ~5.6M gas, about 0.00006 ETH at today's prices.
- **Tempo:** ~$1 of **pathUSD**. Tempo has no native gas token; the testnet deploy paid its fees in pathUSD. The dry run needs ~28M gas (about $0.03).

## 4. Dry run (simulates, sends nothing)

```bash
cd contracts
export DEPOSIT_CAP_USD=500

# Base
FACTORY_OWNER=<base safe> TREASURY=<base safe> \
DEFAULT_YIELD_TARGETS=0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61 \
forge script script/Deploy.s.sol --rpc-url https://mainnet.base.org --account mainnet-deployer

# Tempo (no yield target: the home vault holds plain OUSD)
FACTORY_OWNER=<tempo safe> TREASURY=<tempo safe> \
forge script script/Deploy.s.sol --rpc-url https://rpc.tempo.xyz --account mainnet-deployer
```

Check the logged chain id, owner, and deposit cap before going on.

## 5. Broadcast

Same commands with `--broadcast` added. On Base, add `--verify --etherscan-api-key <key>` to publish the source on Basescan. Copy each logged `StashFactory` address.

## 6. App and worker

In `app/.env.local` (and the hosting provider's env):

```
NEXT_PUBLIC_HOME_NETWORK=tempo
NEXT_PUBLIC_SAVE_NETWORK=base
NEXT_PUBLIC_FACTORY_TEMPO=<tempo factory>
NEXT_PUBLIC_FACTORY_BASE=<base factory>
NEXT_PUBLIC_STASH_GUARDIAN=<see below>
NEXT_PUBLIC_EXIT_URL=<hosted exit page>
NEXT_PUBLIC_REPO_URL=https://github.com/Okorodavid/stash
NEXT_PUBLIC_DEMO_VAULT=<a mainnet vault for /drain, once one exists>
```

- **Stash guardian:** the guardian page needs a Privy login, so use the embedded wallet of a **separate** Privy account you control (a different email from your own Stash account). Its address goes in `NEXT_PUBLIC_STASH_GUARDIAN`. Keep that login out of the app's admin and server secrets so one breach can't give an attacker both a user's account and the guardian.
- **Privy dashboard:** make sure Tempo mainnet and Base mainnet are enabled for the app.
- **Worker:** finds the factory deploy blocks from `contracts/broadcast/`, so run it from the same checkout after deploying. The keeper key (`KEEPER_PRIVATE_KEY` in `app/worker/.env`) needs a little pathUSD on Tempo and ETH on Base to send auto-save pulls.

## 7. Smoke test with small amounts

1. Create a vault, then deposit $5 OUSD.
2. Send $1 instantly, then request $3 and cancel it from the guardian page.
3. Lengthen the waiting period to 48h (applies at once). Request 24h, then cancel the change.
4. Open the Save pot, save $5 USDC (it moves into Gauntlet USDC Prime), then stop earning.
5. Try to deposit more than the cap. The app should block it, and the contract would revert.
6. Withdraw from the vault using only the hosted exit page.
7. Run `/drain` against the new vault.

## 8. After

- Add the factory addresses and the Morpho vault to the README.
- Raise or lift the cap from the Safe (`setDepositCap`) once you're comfortable.
