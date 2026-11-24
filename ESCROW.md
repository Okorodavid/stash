# Stash Escrow

`contracts/src/StashEscrow.sol` holds a buyer's payment until the seller has delivered and the buyer has approved. It is separate from `StashVault` and `StashFactory` and changes nothing in them. Not audited. Not deployed yet.

## How a deal runs

| Step | Who | What happens |
|---|---|---|
| `list` | Seller | Puts an item up at a fixed price in one token, and states the most they accept to pay in fees. The fee and time limits are fixed at this moment. Many buyers can buy the same listing. |
| `buy` | Buyer | Pays the price into the contract, on the fee and time limits the listing was made with. |
| `deliver` | Seller | Records the delivered file's hash. The buyer's review window starts. |
| `release` | Buyer | Approves. The seller is paid the price less the fee; the fee goes to the treasury. |
| `claim` | Anyone | After the review window with no word from the buyer, pays the seller. |
| `dispute` | Buyer | Inside the review window only. Freezes the deal for the arbiter. |
| `rule` | Arbiter (Stash) | Pays the whole amount to the seller (less the fee) or back to the buyer (no fee). |
| `refund` | Seller, or buyer | Seller: any time before the deal ends. Buyer: once the delivery deadline passes with nothing delivered. Always in full. |
| `expireDispute` | Anyone | A dispute not ruled on within 30 days goes back to the buyer. |

Every state has a way out that needs no goodwill: a funded deal times out to the buyer, a delivered deal to the seller, a disputed deal to the buyer.

The one thing that can still hold money is the token itself: USDC and USDT can freeze an address. A frozen buyer or seller blocks only payments to themselves. A frozen treasury blocks seller payouts until the owner names a new treasury.

## Terms

| Term | Value | Changeable |
|---|---|---|
| Fee | 2.5% of the price, minimum $1 | Owner, up to 5%, for future listings only |
| Review window (buyer silent, seller paid) | 3 days | Owner, 1 to 30 days, future listings only |
| Delivery deadline | 7 days | Owner, 1 to 30 days, future listings only |
| Dispute timeout | 30 days, then the buyer is refunded | Fixed in code |
| Cap per deal | $5,000 | Owner, per token |
| Tokens | USDC on Base, USDT on BNB Chain | Owner adds or removes |

Three of these were not in the agreed terms and are defaults to confirm: the 7-day delivery deadline, the seller being able to refund at any time, and the 30-day dispute timeout going to the buyer.

## Who can do what

- **Owner** sets the fee, the windows, the tokens, the treasury and the arbiter, and can pause new listings and new deals. It cannot move money, and cannot change the terms of a listing or deal that already exists. Lowering a token's cap does stop new deals on listings above it.
- **Arbiter** acts only on disputed deals and can only pay that deal's buyer or seller. Keep it a different key from the owner and the deployer.
- There is no function that sweeps or rescues tokens.

## Differences from what was first described

- The key that unlocks the file is not released on-chain. The contract records only the file's hash. The app must gate the download on the deal's state.
- The buyer sees the real file after `deliver`, while the money is still held. A buyer who takes the file and goes quiet still pays, because `claim` works after 3 days.
- There is no dispute deposit.
- `deliver` proves nothing by itself: a seller can call it at once with any hash and start the 3-day clock. The buyer's protection is disputing inside those 3 days, so the app must alert the buyer the moment a deal is marked delivered.

## Tests

```bash
cd contracts
forge test --no-match-contract MorphoForkTest
```

40 escrow tests (`test/StashEscrow.t.sol`) cover both a 6-decimal and an 18-decimal token, every time limit at its boundary, every wrong caller, double payment, fee changes after listing and mid-deal, a token that takes a cut on transfer, a token that freezes addresses, the deploy script, and fuzzed fee maths (also run at 10,000 rounds). All tokens in the tests are mocks; add a fork test against the real USDC and USDT before mainnet.

## Deploy (testnet first)

The deployer key is yours alone. Run these yourself.

Base Sepolia:

```bash
cd contracts
export ESCROW_OWNER=0x...      # who administers it
export ESCROW_TREASURY=0x...   # receives fees
export ESCROW_ARBITER=0x...    # settles disputes; a separate key
export ESCROW_TOKEN=0x...      # the test USDC on Base Sepolia
forge script script/DeployEscrow.s.sol --rpc-url base_sepolia --account deployer            # dry run
forge script script/DeployEscrow.s.sol --rpc-url base_sepolia --account deployer --broadcast
```

BNB Chain testnet: the same, with `--rpc-url bsc_testnet`, `BSC_TESTNET_RPC_URL` set, and `ESCROW_TOKEN` set to a test USDT there.

The script reads the token's decimals from the chain, so the $1 minimum fee and $5,000 cap come out right on both. If `ESCROW_OWNER` is not the deployer, the owner must then call `acceptOwnership()`.

Mainnet token addresses, read from the chain on 2026-11-23 (confirm on the explorer before use):

| Chain | Token | Address | Decimals |
|---|---|---|---|
| BNB Chain | USDT | `0x55d398326f99059fF775485246999027B3197955` | 18 |
| Base | USDC | take it from `app/src/lib/config.ts` | 6 |

BNB Chain mainnet and testnet both accept the `cancun` EVM version this project compiles for.

## Rules for the app pages

Escrow is the first part of Stash where strangers type text and upload files, so the pages must hold to these:

- Shop names, listing titles, descriptions and messages render as plain text. The linter rejects `dangerouslySetInnerHTML` (`react/no-danger`). No Markdown or HTML rendering of user text.
- Validate every field on the server: length limits (name 60, title 100, description 2,000 characters) and no control characters.
- Links are how escrow scams start ("pay me here instead", "connect your wallet to download"). Shop names, titles and descriptions refuse them outright: `http`, `www.`, and bare domains (`site.com`). The error reads "Links aren't allowed." The server checks this, not only the form.
- Wallet and contract addresses, hashes and other long strings are allowed, since sellers may be selling a contract or code. Every listing page shows a fixed line beside the Buy button: "Pay only with this button. Stash can't protect money sent to an address in the description."
- Deal messages may contain links, but show them as plain, unclickable text under a fixed warning: "Stash only protects payments made through this deal. Never pay or connect your wallet anywhere else."
- The only link on a listing is the seller's Stash shop page, which the app generates.
- Uploads: a size cap, an allowlist of file types checked from the file's bytes as well as its name, stored outside the site's domain, and served only as a download (`Content-Disposition: attachment`), never shown inline.
- Downloads are handed out only to the deal's buyer, after `deliver`, through a short-lived signed link.
- Rate-limit listing, uploading and messaging per signed-in user and per IP.
- The arbiter key settles disputes. It never sits on the website or the server; rulings are signed from a separate wallet.

## The app

Pages, all hidden until an escrow address is set:

| Page | What it does |
|---|---|
| `/escrow` | Every active listing, filter by kind, and the signed-in person's own deals |
| `/escrow/new` | List something: shop name, title, kind, details, price, preview image |
| `/escrow/l/<id>` | One listing, with the Buy button and the shareable link |
| `/escrow/shop/<address>` | Everything one seller has for sale, with the shareable shop link |
| `/escrow/deal/<id>` | The deal room: where the deal stands, every button the contract allows each side right now, and each side's note in a dispute |
| `/escrow/disputes` | Stash's dispute desk: open disputes, both notes, the delivered file, and the two rulings. Only the arbiter wallet can open it |

Every page takes `?chain=bnb` for BNB Chain (USDT); without it, Base (USDC). Boards and shops switch between the two.

How the files work:

- Listing text and previews are stored under their own hash; the contract records the hash. Pages refuse any listing whose stored text doesn't match its hash or breaks the rules above.
- The seller uploads the final file to `/api/escrow/deliver`, which checks they are the deal's seller and the file's type, and returns its hash. The seller then records that hash on-chain with `deliver`.
- `/api/escrow/file` gives the file only to the deal's buyer or seller, only the file matching the on-chain hash, always as a download, and never after a refund.
- Files are capped at 4 MB during the beta (sellers can zip). Previews at 2 MB.

Emails (through Resend, to the address on the person's Stash sign-in; wallet-only sign-ins get none):

- The seller, when someone buys: deliver by the deadline.
- The buyer, when the file is delivered: check it before the review window ends, or the seller is paid.
- The seller, when the buyer opens a dispute: add your side.

The app asks for each email right after the transaction; a daily job (`vercel.json`, 08:00 UTC) sends any that were missed, for example when someone used the contract directly. Each email goes once.

To switch it on:

1. Deploy the contract on each chain (above). On BNB testnet there's no official USDT, so deploy a test token and use its address.
2. Done: a private Blob store (`stash-blob`) is connected to the `stash` project, which sets `BLOB_STORE_ID`.
3. In Resend, verify the sending domain and create an API key.
4. Add these to the `stash` project in Vercel, then redeploy:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_ESCROW_BASE_SEPOLIA`, `NEXT_PUBLIC_ESCROW_BASE` | Escrow addresses on Base |
| `NEXT_PUBLIC_ESCROW_BSC_TESTNET`, `NEXT_PUBLIC_ESCROW_BSC` | Escrow addresses on BNB Chain |
| `NEXT_PUBLIC_ESCROW_TOKEN_BSC_TESTNET` | The test USDT on BNB testnet (and `NEXT_PUBLIC_ESCROW_TOKEN_DECIMALS_BSC_TESTNET` if not 18) |
| `RESEND_API_KEY` | From Resend |
| `EMAIL_FROM` | e.g. `Stash <escrow@urelimitless.com>` |
| `CRON_SECRET` | Any long random string; Vercel sends it to the daily job |

Leave a chain's address unset to keep it off.

In local development without a store, files go to `app/.escrow-store/` (git-ignored).

## Not built yet

- Alerts for people who signed in with a wallet only (no email on their account).
- Files over 4 MB.
- Physical goods.
