# Bekçi

**A night watch for your Solana wallet.** Paste any Solana address and Bekçi reads its recent
history in plain language, flags the moves that cost people money, and can keep watching it
for you.

Live: https://bekci.sadelabs.site

- **Lookalike addresses (address poisoning).** A scammer grinds an address that starts and
  ends like one you pay, then sends you dust so it sits in your history. Bekçi names the real
  address it imitates, and flags any transfer you later made to the fake.
- **Open spending permissions.** Token accounts with a live `Approve` delegate, listed as they
  are right now, with a one-click **Revoke** that you sign in your own wallet.
- **Drainer moves.** Token account ownership handed over (`SetAuthority` → `accountOwner`) and
  the wallet itself reassigned to another program (`Assign`).
- **Bait memos, dust, big outflows.**
- **Before you send.** Paste a destination; Bekçi tells you whether you have really paid it
  before, whether it mirrors someone you pay, or whether it is a known poisoner.

Bekçi is read-only. It never asks for a seed phrase or key and never holds funds. The only
transaction it ever builds is a token `Revoke`, which the user signs in their wallet.

## How it works

```
                ┌──────────────── engine (pure TS, shared) ────────────────┐
getTransaction ─▶ decode.ts: jsonParsed tx → wallet events + net change      │
(jsonParsed)    │ risk.ts:   events → findings (lookalike, delegate, owner…) │
                │ checkDestination(): "before you send"                      │
                └────────────────────────────────────────────────────────────┘
Report page:  Solami RPC on the Worker ─▶ engine ─▶ report (edge-cached 60 s)
              no key? the browser reads a public RPC and runs the same engine
Watcher:      Solami webhook (addresses = every active watch) ─▶ /api/hooks/solami
              ─▶ HMAC check ─▶ fetch tx ─▶ engine ─▶ alerts table (dedup) ─▶ email
              minute cron re-syncs the webhook and polls as a safety net
```

- **Data path: [Solami](https://solami.dev).** RPC (`getSignaturesForAddress`,
  `getTransaction`, `getTokenAccountsByOwner`) and Webhooks. One webhook carries every
  actively watched address; Bekçi creates it on first use and keeps its address list in sync.
  Deliveries are verified with `X-Webhook-Signature` (HMAC-SHA256 of the body).
- **Lookalike rule.** Two different addresses sharing at least 6 edge characters, with at
  least 2 at each end. For two random base58 addresses the odds are about 1 in 13 billion,
  so a hit is deliberate. Genuine counterparties are learned only from plain transfers
  (no DEX/program in the transaction), so pool and vault addresses never become "people you pay".
- **Stack.** SvelteKit on Cloudflare Workers, D1 (watches, cursors, alerts, mail log),
  Cloudflare Email Service for alerts, Cache API for report caching.

## Run it

```bash
pnpm install
pnpm test                    # engine tests, including real mainnet fixtures
npx wrangler d1 migrations apply DB --local
pnpm dev                     # http://localhost:5227 (vite; report page)
pnpm preview                 # http://localhost:5228 (wrangler; bindings + cron)
```

Environment (set with `wrangler secret put`):

| Name | Needed for | Notes |
|---|---|---|
| `SOLAMI_API_KEY` | server-side reads, webhooks, email alerts | Without it the report page still works: the browser reads a public RPC. Email watching stays closed and the page says so. |
| `IP_SALT` | rate limiting | Random string; only a salted hash of the IP is stored. |

`wrangler.jsonc` vars: `PUBLIC_ORIGIN`, `FALLBACK_RPC`, `MAIL_FROM`.

Point it at your own key: set `SOLAMI_API_KEY`, deploy, confirm one watch. The first
confirmation creates the Solami webhook and stores its id and signing secret in the `meta`
table.

## Tests

`src/lib/engine/engine.test.ts` runs the decoder against real mainnet transactions saved in
`src/lib/engine/fixtures/` and exercises every rule with transactions built in the exact
`jsonParsed` shape. `scripts/probe.ts <address>` scans a live wallet from the command line.

## Status and limits

- Reads the most recent 40 transactions (25 on a public RPC).
- Token names come from a small, verified label list; other mints show as short addresses.
- Email alerts need the Solami line (see above).

Built in Türkiye by Sezgin Kipel during the Colosseum Crypto World's Fair hackathon
(September–October 2026).
