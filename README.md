# LoopBox

**A little mystery. A better way to collect.** LoopBox sells limited blind-box collectibles made to confirmed demand. Collectors win a free game to unlock a preorder slot, pay, open a digital box whose contents were fixed by a published shuffle, and can swap duplicates inside the same rarity before anything is manufactured. Brands and creator collectives launch their own drops, and collectors can sell their own series in a marketplace.

This is a **single-host hackathon prototype** (NYP Open Hack) with fictional original characters. Payments run in **Stripe test mode** or are simulated. It is not a live store and takes no real money.

![LoopBox desktop home screen](./preview/home.png)

## Problem

Blind-box drops sell out to bots in seconds, and factories guess demand months ahead, so some series are over-produced while fans miss out. After shipping, collectors mail duplicates to each other to trade. LoopBox moves the sale, the allocation and the trading **before** manufacturing. It makes no numerical waste or carbon-saving claim.

## Solution: one system, three models

**B2C limited drop.** A campaign has a hard cap (Astral Kin: 100 boxes, S$18.90 each, at most 2 per collector). Collectors play a short free game (a 30-second fragment run, or an untimed lore challenge) to earn one 15-minute preorder slot, then pay with Stripe Checkout. Each paid order takes the next box from a shuffle that was fingerprinted before sales opened. The reveal shows the character; duplicates can be swapped for another character of the same rarity until allocations lock. The manufacturing manifest counts only paid boxes.

**B2B partner portal.** A brand collaborator or creator collective applies with proof that it owns its characters. An admin approves; the partner drafts a campaign (price, cap, dates, game, 2–8 characters whose box counts must add up to the cap) and submits it. The admin publishes it, which builds and fingerprints its shuffle. The partner dashboard shows plays, wins, paid boxes, sell-through, trades, revenue and the partner's share, and downloads the manifest.

**C2C creator marketplace.** A collector who verifies an email and a phone number (simulated codes) can list their own series with photos and the stock they hold of each character. Buyers see the full stock table, pay in-app, and each box is drawn from the remaining stock. The money is held until the buyer confirms receipt; the platform records its fee. Buyers can report a problem; an admin upholds (refund) or dismisses it, and the seller's trust score updates.

## Architecture

| Layer    | Choice                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI       | Next.js 16 App Router, React 19, plain CSS tokens (no Tailwind)                                                                                                        |
| API      | `/api/loopbox` action endpoint (Zod discriminated union) + small GET routes + `/api/stripe/*` + `/api/upload`                                                          |
| Domain   | `src/domain/*` pure functions: fairness shuffle, C2C draw, fee, trust, metrics                                                                                         |
| Service  | `src/server/*`: every method takes the user id first and checks role and ownership                                                                                     |
| Database | SQLite through Node's built-in `node:sqlite`, WAL, `BEGIN IMMEDIATE` writes, CHECK constraints and triggers, forward-only migrations (`PRAGMA user_version`, 8 so far) |
| Payments | Stripe Checkout Sessions (test mode) + signed webhook; simulated webhook in demo mode                                                                                  |
| Files    | Local disk `data/uploads/`, type decided by magic bytes                                                                                                                |
| Jobs     | Admin "Run sweep" + lazy expiry on read (no cron)                                                                                                                      |
| Hosting  | One Node 24 server with a persistent disk; laptop as backup                                                                                                            |

```
 Browser (mobile-first UI, no business rules)
    │  fetch JSON (same-origin POST, Zod-validated, 8 KB cap)
    ▼
 Next.js route handlers ──► src/server/*.ts (roles, ownership, transactions) ──► src/domain/* (pure)
    │                             │
    │                             ▼
    │                      SQLite file (WAL) + CHECKs + append-only triggers
    │                      data/loopbox.sqlite, data/uploads/
    ▼
 checkout action ──► Stripe (test) Checkout page
                              │
      /api/stripe/webhook ◄───┘ signed event ─► webhook_events (dedupe) ─► allocate / hold funds in one txn
      /api/stripe/simulate (demo only) ─► the same handler
```

### The fairness proof, explained to a 12-year-old

Before anyone buys, the computer shuffles all 100 boxes using a secret random number and writes down the order. It doesn't show you the order; it shows you a **fingerprint** of it (a SHA-256 hash). Changing even one box would change the fingerprint completely. Boxes are then handed out strictly in that order: the first buyer gets box 1, the next box 2, and so on. When preorders close, the secret number is revealed. Your browser re-does the shuffle itself and checks that the fingerprint matches the one published at the start. If it matches, nobody moved a box after sales opened, not even us.

**Demo honesty:** the seeded Astral Kin drop uses a fixed, disclosed seed so box 94 is always Eclipse Knight and the walkthrough is repeatable. The fingerprint still proves the order never changed after it was published. The verify page says the same.

## Download and run (no install step)

Every push to `main` builds a ready-to-run download, tests it in a real browser, and publishes it on the [**Releases page**](https://github.com/gohziqian1234-cmyk/hackaton-open-hack-/releases/latest).

1. Install **Node.js 22.13 or newer** (24 recommended) from [nodejs.org](https://nodejs.org).
2. Download `loopbox-<version>.zip` from the latest release and unzip it.
3. Double-click `start-windows.cmd` (Windows), run `./start-mac-linux.sh` (macOS/Linux), or run `node start.mjs`.
4. Open **http://127.0.0.1:3000**.

It runs in demo mode with simulated payments and keeps its data in the `data` folder next to it (delete the folder to reset). `HOW-TO-RUN.txt` inside the download has the details. The release is built by `.github/workflows/release.yml`: `LOOPBOX_STANDALONE=true npm run build`, then `node scripts/package-release.mjs`, then the golden-path and marketplace browser tests against the package (`playwright.release.config.ts`).

## Setup (from source)

Requires **Node 24 or newer** and npm. No credentials are needed for the demo.

```bash
npm ci
cp .env.example .env.local   # optional; on Windows use Copy-Item
npm run dev                  # http://127.0.0.1:3000
```

The database is created and seeded on the first request. `npm run reset:demo` (with the server stopped) deletes the local database so the next start re-seeds 93 / 100.

### Environment variables

| Variable                                      | Default                 | What it does                                                                                                                               |
| --------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `LOOPBOX_DB`                                  | `data/loopbox.sqlite`   | SQLite file. Uploads are stored in `uploads/` next to it.                                                                                  |
| `DEMO_MODE`                                   | `true`                  | Demo identity switcher, "Demo: win instantly", simulated payments without keys, OTP codes shown on screen. `false` turns all of these off. |
| `ADMIN_DEMO`                                  | `true`                  | Adds Admin to the demo switcher. Set `false` on any long-lived public deployment.                                                          |
| `STRIPE_SECRET_KEY`                           | empty                   | Stripe **test** key (`sk_test_…`). Live keys are refused at start-up and at runtime. Server-only.                                          |
| `STRIPE_WEBHOOK_SECRET`                       | empty                   | `whsec_…` for verifying webhooks. Server-only.                                                                                             |
| `NEXT_PUBLIC_APP_URL`                         | `http://127.0.0.1:3000` | Base URL for Stripe return links (Render's `RENDER_EXTERNAL_URL` is used when unset).                                                      |
| `SIMULATE_PAYMENTS`                           | `true`                  | In demo mode, allows the simulated webhook even when Stripe keys are set.                                                                  |
| `MAX_CHARGE_CENTS`                            | `100000`                | Hard ceiling for any single charge (S$1,000).                                                                                              |
| `HOSTNAME` / `PORT`                           | `127.0.0.1` / `3000`    | `npm start` binds to localhost unless `HOSTNAME=0.0.0.0`.                                                                                  |
| `HTTPS_ONLY`                                  | unset                   | `true` adds HSTS and `upgrade-insecure-requests`.                                                                                          |
| `COOKIE_SECURE`                               | unset                   | `true` always marks the session cookie `Secure` (it already is on HTTPS requests).                                                         |
| `RATE_LIMIT_SCALE`                            | `1`                     | Multiplies every rate limit. For load tests only.                                                                                          |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | —                       | Used only by `npm run create-admin`.                                                                                                       |

`npm start` runs `scripts/check-env.mjs` first and **refuses to start** with a live Stripe key, a malformed webhook secret, a secret-looking value in any `NEXT_PUBLIC_` variable, an invalid spending cap, or an http app URL under `HTTPS_ONLY`. It warns (without printing any secret) when demo mode or the admin switcher is on for a public host.

## Seed and demo accounts

On an empty database the app seeds:

- **Astral Kin** by Astral Studio: 100 boxes (Nova Scout, Moss Oracle, Tide Keeper, Ember Cub 21 each, Common; Eclipse Knight, Aurora Warden 7 each, Rare; The Void Prince 2, Secret), 93 already sold, fingerprint published.
- **Kopi Kaki Collective**: a draft campaign (5 characters, cap 40). **Hawker Heroes**: a submitted partner application.
- Marketplace listings: Mei's _Tropical Treats_ (trust 96), Jun's _Night Market Cats_ (88), Priya's _Garden City Sprouts_ (100, a single rare left), and one paid Alex←Mei order with a three-message chat.

Demo identities (open **Me** → _Demo identities_, or use the top-right chip): **Alex** (collector, verified, already owns one Eclipse Knight), **Sarah (demo)** (collector, has Aurora Warden listed for trade, unverified), **Mei**, **Jun**, **Priya** (verified sellers), **Astral Studio** and **Kopi Kaki Collective** (partners), **Admin**. Real accounts can also sign up at `/login` with an email and a password.

The 90-second walkthrough is in [DEMO.md](./DEMO.md).

## Payments (Stripe test mode)

A box is allocated only after a signed, de-duplicated `checkout.session.completed` webhook; the success page never allocates. With no keys in demo mode, **Pay with card** runs a simulated payment through the same handler and says so on screen.

For real test payments on a laptop: put `STRIPE_SECRET_KEY=sk_test_…` in `.env.local`, run `stripe listen --forward-to 127.0.0.1:3000/api/stripe/webhook`, copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`, restart, and pay with `4242 4242 4242 4242`, any future date, any CVC.

Safety rails: an unpaid order holds its box for 31 minutes (Stripe's minimum session life is 30), then expires and the box goes back. A payment that arrives after its box was given away is refunded automatically. `MAX_CHARGE_CENTS` caps any single charge.

## Deploy (single host)

[**Deploy to Render**](https://render.com/deploy?repo=https://github.com/gohziqian1234-cmyk/hackaton-open-hack-/tree/claude/great-ramanujan-ou59s1) — Render reads `render.yaml` (Node 24, Singapore, health check `/api/health`, HTTPS-only headers, secure cookies). Leave the Stripe fields empty for simulated payments, click **Apply**, and the site appears at `https://loopbox-XXXX.onrender.com` after a 3–5 minute build. Every push to the branch redeploys. If the button can't find the Blueprint: Render dashboard → New → Blueprint → this repository → branch `claude/great-ramanujan-ou59s1`.

The free plan sleeps after 15 idle minutes and has no persistent disk, so the demo re-seeds to 93 / 100 on restart. For data that must survive, use a paid plan and enable the disk block in `render.yaml`. Before leaving the site public: set `ADMIN_DEMO=false` (and ideally `DEMO_MODE=false`), then create a real admin from the Render shell with `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run create-admin`.

Any other host: `Dockerfile` builds a Node 24 image running `npm start` on port 3000; mount a persistent volume at `/app/data`. **Do not use Vercel or any serverless platform**: SQLite writes would be lost.

## Tests

```bash
npm run typecheck   # TypeScript, no errors
npm run lint        # ESLint, 0 errors
npm test            # Vitest: 148 tests in 14 files
npm run build       # production build
npm run test:e2e    # Playwright: 10 browser tests (set PW_CHROMIUM_PATH if Chrome isn't installed)
```

What they prove (counts from the last run at tag `m9-green`):

- **Fairness:** pool length, deterministic shuffle, commitment recompute, mismatch detection, browser and server give the same result.
- **Payments:** age confirmation required; the same Stripe event 3× allocates once; a bad signature is 400; 50 concurrent payments for the last 3 boxes give exactly 3 allocations and 47 refunds; live keys and over-cap charges refused.
- **Marketplace:** fee table (1 cent, 625, 1000, 100000); the draw never picks an empty character and matches stock shares within ±2 points over 10,000 draws; 50 parallel buys over five database connections for 5 boxes never go below zero; a seller can't buy their own listing (403 and a database CHECK); the draw log can't be edited or deleted; a chat message containing `<script>` renders as text.
- **Authorization (`tests/authz.test.ts`):** every IDOR case in the spec (someone else's allocation, access, match, partner analytics and manifest, listing, order, chat) and every forbidden cell of the role matrix; plus a `DEMO_MODE=false` smoke test.
- **Hardening:** request bodies are capped while streaming (a 10 MB chunked body stops after ~8 KB); the start-up config check.
- **Browser:** the golden path (quest → pay → reveal → trade → close → manifest → verify), keyboard game with pause, 375px layout with reduced motion and no WebGL, API boundaries and role guards, 50 concurrent purchases across two processes, partner portal journey, two marketplace journeys, and every route at 390px with no sideways scroll and no axe (WCAG 2.1 A/AA) violations.

## Security

| Area                | What is in place                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication      | Email + password accounts (scrypt), random 32-byte session tokens stored only as SHA-256 hashes, 24-hour sessions, token rotation on sign-in, lockout after 5 wrong passwords for 15 minutes. Demo sign-in exists only in demo mode. |
| Cookies             | `loopbox_session`: HttpOnly, SameSite=Strict, Secure on HTTPS (always with `COOKIE_SECURE=true`), path `/`.                                                                                                                          |
| Authorization       | Every service method checks role and ownership; other people's records answer 404/403. Admin routes and actions require the ADMIN role. Covered by `tests/authz.test.ts`.                                                            |
| Input               | Zod on every action and query; text is Unicode-normalised with control and bidi characters stripped; links must be http(s); `% _` are escaped in search.                                                                             |
| SQL injection       | Every query uses `?` parameters. The only string-built SQL joins fixed fragments.                                                                                                                                                    |
| XSS                 | React text rendering only (no `dangerouslySetInnerHTML`, `innerHTML` or `eval` anywhere); CSP `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`; CSV cells are formula-neutralised.                                |
| CSRF                | Every POST must come from the same origin (403 `INVALID_ORIGIN`) and cookies are SameSite=Strict.                                                                                                                                    |
| Rate limits         | Per session or IP: 20 actions/min, 10 sign-in attempts per 10 min, 120 reads/min; OTP 5 per 10 min; chat 30 per 10 min; uploads 20/min and 30/hour; admin, manifest, verify, webhook each limited.                                   |
| Body size           | 8 KB for actions, 1 KB for simulate, 64 KB for webhooks, 2 MB (+ envelope) for uploads, enforced while reading.                                                                                                                      |
| Uploads             | Only PNG/JPEG/WebP recognised by their first bytes (name and declared type ignored), ≤2 MB, random file names, served with the stored type, `nosniff` and a sandbox CSP; drafts are visible to their uploader only.                  |
| Payments            | Test keys only, amount always from the database, spending cap, signature-checked and de-duplicated webhooks.                                                                                                                         |
| Database rules      | CHECK constraints (capacity, stock ≥ 0 and ≤ declared, buyer ≠ seller, fee + seller share = total), unique pool units, append-only triggers on the pool, commitments, C2C draws and audit log.                                       |
| Headers             | CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, COOP, CORP, `Permissions-Policy`; HSTS with `HTTPS_ONLY=true`; `X-Powered-By` removed.                                                                    |
| Production settings | `next start` (production mode), no browser source maps, errors return a code only (`SERVER_ERROR`) with no stack, logs never contain emails, phones or tokens, audit rows hold ids only.                                             |
| Secrets             | Only in server environment variables; `.env*` is git-ignored; the full git history was scanned and holds no keys, tokens or database files.                                                                                          |

Not in place (see limitations): CAPTCHA, cross-host rate limiting, real SMS/email delivery, authoritative anti-cheat.

## What is real and what is simulated

| Feature                    | Real in this build                                                               | Simulated or missing                                                                         |
| -------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Accounts                   | Email + password sign-up and sign-in                                             | Demo identity switcher (demo mode only)                                                      |
| Game gate                  | Server-issued one-use sessions, server-side scoring, daily attempt limit         | "Demo: win instantly" (demo mode only); no authoritative anti-cheat                          |
| B2C payment                | Stripe Checkout in test mode + signed webhook                                    | Simulated webhook when no keys are set (labelled on screen)                                  |
| Fair allocation            | Committed shuffle, public fingerprint, in-browser verification                   | The demo campaign's seed is fixed and disclosed                                              |
| Trades                     | Same-rarity reciprocal matching, both must accept                                | Sarah's acceptance in the scripted demo                                                      |
| Partner portal             | Applications, approval, drafts, publish, dashboard, manifest                     | Payouts to partners                                                                          |
| Marketplace                | Listings, uploads, stock-weighted draws, held funds ledger, reports, trust, chat | OTP codes are shown on screen instead of sent; seller payouts; declared stock is not checked |
| Manufacturing and shipping | Manifest CSV from paid boxes                                                     | No factory or courier integration                                                            |
| Seed data                  | —                                                                                | 93 historical Astral Kin orders and the marketplace listings are demo data                   |

## Business model (every number is an assumption or projection)

- **B2C and partner drops:** LoopBox keeps the difference between the box price and the partner's share. The partner's share is **30% of paid orders** by default (`revenue_share_bps = 3000`), an **assumption** to be agreed with each partner.
- **Marketplace:** platform fee **8% of each order, minimum S$0.50** (`src/domain/fee.ts`), an **assumption** the founders will set.
- **Wedge (assumption):** creator collectives who can't afford a factory minimum order, because every unit is paid before it is made.
- No revenue, user or market-size figures are claimed; any the team presents are **projections** to be labelled as such.

## LEGAL REVIEW REQUIRED

This prototype has **not** been reviewed by a lawyer. Before any real launch, get advice on:

- **Gambling Control Act 2022 (Singapore):** whether paid chance-based blind boxes and marketplace draws fall within its scope.
- **Consumer protection (fair trading):** preorders, cancellation, refunds and late delivery.
- **PDPA:** collection and retention of names, emails, phone numbers and age confirmations.
- **IP and licensing:** brand collaborator drops and seller-listed series (counterfeits).
- **Seller-declared stock:** liability when a seller's declared stock is wrong.
- **Payments and escrow regulation:** holding funds for sellers until receipt.

## Limitations

- SQLite on one host: no horizontal scaling; the free Render plan loses data on restart.
- Rate limits are in memory on one process.
- OTP codes are simulated; no SMS or email is sent.
- No CAPTCHA; the game check is a plausibility check, not authoritative anti-cheat.
- Seller payouts and partner payouts are ledger entries only (no Stripe Connect).
- Only two-way swaps; no multi-way trade cycles.
- With `DEMO_MODE=false` the demo catalogue (Astral Kin and the seeded listings) is still seeded on an empty database; its seeded accounts have no passwords and cannot sign in.

## Future work

PostgreSQL for multiple servers; Stripe Connect payouts for partners and sellers; Singpass / MyInfo and real SMS verification; CAPTCHA and stronger anti-bot measures; multi-way swaps; a native app; factory and courier integrations.
