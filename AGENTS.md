<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# LoopBox — Agent Spec (single source of truth)

`CLAUDE.md` contains only `@AGENTS.md`, so Claude Code and Codex read this same file. Never fork the spec. If you change a rule here, say so in your report.

Read this whole file at the start of every session. Then read `DESIGN.md` and open `design/reference.html` before any UI work. Then read `PROJECT_STATE.md`.

---

## 1. Product summary

LoopBox sells limited blind-box collectibles made to confirmed demand, on one system with three models:

1. **B2C Limited Drop (P0):** win a free themed game → 1 time-limited preorder slot → pay full price with Stripe test Checkout → 1 box allocated from a pre-committed shuffle → animated reveal → keep or swap within the same rarity → close → manufacture confirmed units only.
2. **B2B Partner Portal (P1, thin):** brands and creator collectives apply, admin approves, partner drafts a campaign, admin publishes, partner sees a dashboard and a manifest.
3. **C2C Creator Marketplace (P1, thin):** verified users list their own series with declared stock; buyers pay in-app; the platform draws each box weighted by remaining stock; seller fulfils; buyer confirms; platform keeps a fee.

Market: Singapore, SGD. Hackathon: NYP Open Hack, 48 hours, team does not write code.

### Non-goals (do NOT build)
Native mobile app. AI chatbot. NFTs or crypto. Social feed. Real seller payouts (Stripe Connect). Real SMS or Singpass verification. Private/off-platform payment in C2C. Multi-way trade cycles (P2 only). PostgreSQL/Supabase migration. Any copy claiming legal compliance.

---

## 2. Glossary (every term used in code, UI and reports)

| Term | Exact meaning | Code name |
|---|---|---|
| Campaign / Drop | One limited series sold via the B2C flow, with a hard unit cap, price, dates, phase. | `campaigns` row |
| Partner | An organisation that owns campaigns. Type is `BRAND` (Brand Collaborator: existing brand/IP) or `COLLECTIVE` (Creator Collective: group of independent creators). | `partners` |
| Series | The set of characters belonging to one campaign or one listing. In this MVP one campaign = one series. | implicit |
| Character | One collectible design with a name, rarity tier, colour and description. | `characters` |
| Rarity Tier | `COMMON`, `RARE` or `SECRET`. Swaps are only allowed inside one tier. | `rarity` column |
| Pool Unit | One physical box-to-be in a campaign. Exactly `capacity` units exist per campaign; each has a fixed position in the committed shuffle and a character. | `pool_units` |
| Fairness Commitment | SHA-256 hex of the canonical shuffle string, published when the campaign goes live; seed revealed at close. | `fairness_commitments` |
| Game Session | One server-issued play of a game (mode `run` or `lore`), single use, with seed and start time. | `game_sessions` |
| Attempt | One Game Session counted against the daily attempt limit. | `game_sessions` row |
| Slot Reservation | Right to buy 1 box, earned by winning, expires after 15 minutes if unused. Statuses map: AVAILABLE=ACTIVE, RESERVED=checkout started, REDEEMED=CONSUMED, EXPIRED. Non-transferable. | `access` |
| Order | A B2C purchase of 1 box tied to exactly 1 Slot Reservation. | `orders` |
| Payment | The Stripe Checkout Session and its outcome for an Order or Marketplace Order. | `payments` |
| Allocation | The assignment of one Pool Unit to one Order and its current owner. | `allocations` |
| Opening | The first time the owner views the reveal; sets `revealed=1`. Never changes the character. | `reveal` action |
| Lock | Owner chooses to keep; allocation leaves the trade flow. | `keep` action |
| Trade Pool Entry | An allocation offered for swap with a Wishlist. | `allocations.status=TRADE_LISTED` + `preferences` |
| Wishlist | Character IDs (same tier) the owner will accept in return. | `preferences` |
| Swap | Atomic exchange of owners between two allocations of the same campaign and tier, after both accept. | `matches` |
| Seller Listing | A C2C offer by a Verified User for their own series. | `listings` |
| Declared Stock | Seller-stated count per character per listing. Unverified by the platform. | `listing_stock.declared` |
| C2C Draw | One random pick of a character for one purchased box, weighted by remaining stock, logged immutably. | `c2c_draws` |
| Marketplace Order | A C2C purchase of N boxes from one listing. | `market_orders` |
| Held Funds | Money recorded as owed to the seller but not released until Receipt Confirmation. A ledger status, not a real bank hold. | `market_orders.payout_status` |
| Platform Fee | Server-computed integer cents taken from a Marketplace Order (Section 13). | `market_orders.fee_cents` |
| Fulfilment | Seller marks the order shipped or handed over, with a note. | `market_orders.status=FULFILLED` |
| Receipt Confirmation | Buyer confirms items received as drawn. | `COMPLETED` |
| Report | Buyer states wrong/missing item or non-delivery. | `reports` |
| Trust Score | Integer 0–100 per seller (formula in Section 13). | `users.trust_score` |
| Manifest | CSV of final character quantities for manufacturing, derived from final allocations. | `/api/manifest` |
| Verified User | User with `email_verified_at` AND `phone_verified_at` set. In this MVP OTP is simulated (code shown on screen in DEMO_MODE). | `users` columns |
| DEMO_MODE | Env flag `DEMO_MODE=true`. Enables demo identities, auto-win button, simulated payment, seeded data. | `process.env.DEMO_MODE` |

---

## 3. Stack (FACT: this is what the repo already uses — do not replace it)

- Next.js 16 App Router, React 19.2, TypeScript 5.9, Zod 4, Node 24 (`node:sqlite`), Vitest 4, Playwright 1.58, ESLint 9, Prettier 3.
- 3D: three 0.183, @react-three/fiber 9, @react-three/drei 10 (lazy-loaded; static SVG fallback exists).
- Icons: lucide-react.
- Database: SQLite via Node's built-in `node:sqlite`, file `data/loopbox.sqlite`, WAL mode, `BEGIN IMMEDIATE` for writes.
- Sessions: random token in HTTP-only SameSite=strict cookie `loopbox_session`.
- Styling: plain CSS in `src/app/globals.css` with CSS custom properties. **No Tailwind.** Do not add Tailwind.
- Packages you ARE allowed to add (and no others without asking): `stripe` (server SDK), `@fontsource-variable/unbounded`, `@fontsource-variable/figtree`. Remove `@fontsource-variable/dm-sans` and `@fontsource-variable/manrope` in M1.
- Before using ANY API (Next.js, Stripe, node:sqlite, R3F): check the installed version in `node_modules/<pkg>/package.json` and read its docs (`node_modules/next/dist/docs/`, Stripe official docs). Never guess a signature. If you cannot confirm an API, stop and report it.

### Hosting consequence (important)
SQLite needs a persistent writable disk on ONE server. **Do not deploy to Vercel serverless** — writes would be lost. Deploy to a single Node 24 host with a persistent disk (candidates: Render, Railway, Fly.io — UNVERIFIED pricing, the human checks). Backup: localhost on the demo laptop.

---

## 4. Repo structure

```
src/app/                 routes (UI only, no business rules)
src/app/api/loopbox/     JSON action endpoint (existing)
src/app/api/stripe/      webhook + checkout routes (M5)
src/app/api/manifest/    CSV export (M6)
src/components/          React components: presentation + transient UI state only
src/components/ui/       design-system primitives (M1): Button, Tier, Stat, Card, Empty, ErrorNote, Sheet
src/domain/              PURE functions, no DB, no I/O: shuffle, commitment, pool, draw, fee, trust, matching, state guards
src/server/              DB access + transactions: service.ts, schema.ts, db.ts, validation.ts, stripe.ts
src/lib/                 shared types, catalog, formatters
tests/                   vitest unit + domain tests
tests/e2e/               Playwright
design/reference.html    visual target (read-only for the agent)
DESIGN.md                design rules
PROJECT_STATE.md         updated by agent every milestone
```

Rule: a component may call `/api/*` and render results. It never decides entitlement, price, allocation, fee, stock, or ownership.

---

## 5. Data model (SQLite). Existing tables are kept; new ones are added by forward-only migrations in `src/server/schema.ts`.

Conventions: `id TEXT PRIMARY KEY` (random UUID via `crypto.randomUUID()`), times are `INTEGER` epoch ms, money is `INTEGER` SGD cents, `created_at INTEGER NOT NULL` on every table. `PRAGMA foreign_keys=ON` always.

### Existing (keep, extend with columns noted)
- `users(id, name, role CHECK IN ('COLLECTOR','BUSINESS','ADMIN'), created_at, email TEXT UNIQUE, email_verified_at INTEGER, phone TEXT, phone_verified_at INTEGER, age_confirmed_at INTEGER, trust_score INTEGER NOT NULL DEFAULT 100 CHECK(trust_score BETWEEN 0 AND 100))` — add `ADMIN` to the CHECK via table rebuild migration.
- `businesses` → becomes `partners` (migration: create `partners`, copy rows, keep `businesses` as a view or leave table; campaigns get `partner_id`).
- `campaigns(... existing ..., partner_id TEXT REFERENCES partners(id), game_mode TEXT NOT NULL DEFAULT 'run' CHECK(game_mode IN ('run','lore')), required_score INTEGER NOT NULL DEFAULT 10, attempts_per_day INTEGER NOT NULL DEFAULT 5, revenue_share_bps INTEGER NOT NULL DEFAULT 3000 CHECK(revenue_share_bps BETWEEN 0 AND 10000))`. Phase CHECK adds `'DRAFT','IN_REVIEW','CANCELLED'`.
- `characters(... existing ..., units INTEGER NOT NULL DEFAULT 0 CHECK(units>=0), color TEXT, description TEXT)`. `weight` stays for backwards compatibility but is no longer used for allocation after M4.
- `sessions`, `game_sessions`, `access` — unchanged except `access.order_id TEXT UNIQUE` (one reservation → at most one order).
- `orders(... existing ..., status CHECK IN ('PENDING_PAYMENT','PAID','DEMO_PAID','EXPIRED','REFUNDED'), stripe_session_id TEXT UNIQUE, paid_at INTEGER)`.
- `allocations(... existing ..., pool_unit_id TEXT UNIQUE REFERENCES pool_units(id))`.
- `preferences`, `matches`, `waitlist` — unchanged.

### New
- `partners(id, name, type CHECK IN ('BRAND','COLLECTIVE'), owner_user_id REFERENCES users, created_at)`
- `partner_members(partner_id, user_id, role CHECK IN ('OWNER','MEMBER'), PRIMARY KEY(partner_id,user_id))`
- `partner_applications(id, user_id, type, org_name, contact_email, website, portfolio_url, ip_ownership_statement TEXT NOT NULL, members_count INTEGER, proposed_series TEXT, status CHECK IN ('SUBMITTED','APPROVED','REJECTED','INFO_REQUESTED'), admin_note TEXT, created_at, decided_at)`
- `pool_units(id, campaign_id REFERENCES campaigns, position INTEGER NOT NULL, character_id REFERENCES characters, allocated INTEGER NOT NULL DEFAULT 0, UNIQUE(campaign_id, position))` + index `(campaign_id, allocated, position)`
- `fairness_commitments(campaign_id PRIMARY KEY, commitment_hex TEXT NOT NULL, seed_hex TEXT, committed_at INTEGER NOT NULL, revealed_at INTEGER)`
- `payments(id, kind CHECK IN ('B2C','C2C'), ref_id TEXT NOT NULL, stripe_session_id TEXT UNIQUE, amount_cents INTEGER NOT NULL CHECK(amount_cents>0), status CHECK IN ('OPEN','PAID','EXPIRED','FAILED','REFUNDED','SIMULATED'), created_at, updated_at)`
- `webhook_events(id TEXT PRIMARY KEY /* Stripe event id */, type TEXT, received_at INTEGER, processed_at INTEGER)` — insert first; duplicate id = skip.
- `listings(id, seller_id REFERENCES users, title, theme, description, price_cents INTEGER CHECK(price_cents BETWEEN 100 AND 100000), fulfilment CHECK IN ('SHIP','MEETUP','BOTH'), status CHECK IN ('DRAFT','ACTIVE','SOLD_OUT','PAUSED','SUSPENDED'), created_at, updated_at)`
- `listing_characters(id, listing_id, name, rarity, declared INTEGER CHECK(declared>=0), remaining INTEGER CHECK(remaining>=0 AND remaining<=declared), image_path TEXT)`
- `listing_photos(id, listing_id, path, mime, bytes)`
- `market_orders(id, listing_id, buyer_id, seller_id, quantity INTEGER CHECK(quantity BETWEEN 1 AND 10), subtotal_cents, fee_cents, seller_owed_cents, status CHECK IN ('PENDING_PAYMENT','PAID_HELD','FULFILLED','COMPLETED','REPORTED','RESOLVED','REFUNDED','EXPIRED'), payout_status CHECK IN ('NONE','HELD','OWED','VOID'), fulfilment_note TEXT, created_at, paid_at, fulfilled_at, completed_at, CHECK(buyer_id<>seller_id), CHECK(subtotal_cents = fee_cents + seller_owed_cents))`
- `c2c_draws(id, market_order_id, box_index INTEGER, listing_character_id, random_value INTEGER, stock_snapshot TEXT /* JSON */, created_at, UNIQUE(market_order_id, box_index))` + triggers blocking UPDATE and DELETE (`RAISE(ABORT,'IMMUTABLE')`).
- `chat_threads(id, market_order_id UNIQUE, buyer_id, seller_id, created_at)`; `chat_messages(id, thread_id, sender_id, body TEXT CHECK(length(body) BETWEEN 1 AND 1000), created_at)` + index `(thread_id, created_at)`
- `reports(id, market_order_id, reporter_id, reason CHECK IN ('WRONG_ITEM','MISSING_ITEM','NOT_DELIVERED','OTHER'), details TEXT, status CHECK IN ('OPEN','UPHELD','DISMISSED'), created_at, resolved_at)`
- `audit_log(id, actor_id, action TEXT, entity TEXT, entity_id TEXT, detail TEXT /* JSON, no PII */, created_at)` + triggers blocking UPDATE/DELETE.

### Access control (replaces "RLS" — SQLite has none)
Every service method takes `userId` first and checks ownership/role before reading or writing. Tests in `tests/authz.test.ts` must prove each IDOR case in Section 17 returns 403/404.

---

## 6. State machines (any transition not listed is FORBIDDEN and must throw `DomainError('INVALID_STATE',409)`)

**Campaign phase** (existing names kept; founder names in brackets)
`DRAFT →(partner submits) IN_REVIEW →(admin publish: creates pool + commitment) UPCOMING | ACTIVE_PREORDER[LIVE] →(admin close or cap reached + no PENDING orders) PREORDER_CLOSED[CLOSED] → TRADE_WINDOW → ALLOCATION_LOCKED →(admin) IN_PRODUCTION[MANUFACTURING] → SHIPPING[SHIPPED] → COMPLETED`. `CANCELLED` reachable from DRAFT, IN_REVIEW, UPCOMING only. Seed is revealed on entering `PREORDER_CLOSED`.

**Slot Reservation (`access`)**: `AVAILABLE →(checkout started) RESERVED →(payment confirmed) REDEEMED`; `AVAILABLE|RESERVED →(expiry sweep / session expired) EXPIRED`. RESERVED→AVAILABLE allowed only when Stripe session is cancelled before expiry and reservation time remains.

**Order**: `PENDING_PAYMENT →(verified webhook or DEMO simulate) PAID →(allocation in same txn) [allocation exists]`; `PENDING_PAYMENT → EXPIRED`; `PAID → REFUNDED` (admin, audited). `DEMO_PAID` is legacy seed data only.

**Allocation**: `OWNED(revealed=0) →(open) OWNED(revealed=1) →(keep) OWNED | →(trade) TRADE_LISTED →(match) TRADE_PENDING →(both accept) OWNED (new owner) | →(decline/withdraw) OWNED`; all → `LOCKED_FOR_PRODUCTION` at ALLOCATION_LOCKED. Founder names: REVEALED=OWNED+revealed, IN_TRADE_POOL=TRADE_LISTED, SWAPPED=owner changed, REVERTED=back to OWNED at close, FINAL=LOCKED_FOR_PRODUCTION.

**Trade Pool Entry**: `OPEN(TRADE_LISTED) → MATCHED(TRADE_PENDING) | WITHDRAWN(keep) | EXPIRED(at lock)`.

**PartnerApplication**: `SUBMITTED → APPROVED | REJECTED | INFO_REQUESTED`; `INFO_REQUESTED →(applicant edits) SUBMITTED`.

**SellerListing**: `DRAFT →(verified seller publishes, validation passes) ACTIVE → SOLD_OUT (remaining=0 all chars) | PAUSED (seller) | SUSPENDED (trust<50 or admin)`; `PAUSED → ACTIVE`; `SUSPENDED → ACTIVE` admin only.

**MarketplaceOrder**: `PENDING_PAYMENT →(payment) PAID_HELD →(seller) FULFILLED →(buyer confirm, or 7 days) COMPLETED`; `PAID_HELD|FULFILLED →(buyer report) REPORTED →(admin) RESOLVED | REFUNDED`; `PENDING_PAYMENT → EXPIRED` (stock returned in same txn).

---

## 7. Invariants (enforced in DB constraints/triggers or inside one `BEGIN IMMEDIATE` transaction — never UI-only)

1. Count of B2C orders with status IN ('PENDING_PAYMENT','PAID','DEMO_PAID') per campaign ≤ capacity (rewrite `capacity_guard` trigger with this filter).
2. Each Pool Unit allocated at most once (`allocations.pool_unit_id UNIQUE` + `pool_units.allocated` flip in same txn).
3. One reservation → at most one order (`orders.access_id UNIQUE`).
4. Same Stripe event processed once (`webhook_events` PK) and one Order → at most one allocation (`allocations.order_id UNIQUE`).
5. An allocation has exactly one status (single column + CHECK).
6. Swaps: same campaign, same tier, both TRADE_PENDING, one txn.
7. After PREORDER_CLOSED: no new orders; after ALLOCATION_LOCKED: no ownership change; any admin override writes `audit_log`.
8. C2C: `remaining >= 0` CHECK; draw and decrement in one txn; a draw never selects a character with remaining=0.
9. `market_orders CHECK(buyer_id<>seller_id)`.
10. Fee computed only in `src/domain/fee.ts`, integer cents.
11. Partners see only campaigns where they are members; sellers see only their listings/orders; buyers only their orders; chat only its two parties.
12. Unverified users cannot create or publish listings (403 `VERIFICATION_REQUIRED`).
13. Slot reservations cannot be transferred (no API exists to change `access.user_id`).
14. Every money, allocation, stock, phase and admin event writes one `audit_log` row.

---

## 8. B2C fairness algorithm (`src/domain/fairness.ts`, pure)

1. `buildPool(characters)` → array of characterIds repeated `units` times, length must equal capacity, else throw.
2. `seed` = 32 random bytes (`crypto.randomBytes`), hex.
3. `shuffle(pool, seed)`: Fisher–Yates where index `j` for step `i` = HMAC-SHA256(seed, "i:"+i) read as BigInt mod (i+1). Deterministic given seed.
4. `canonical(order)` = order.join(","). `commitment = sha256(seedHex + "|" + canonical)` hex.
5. On publish: insert `pool_units` with positions 0..capacity-1 and `fairness_commitments(commitment_hex, seed_hex=NULL in public views)`. Store seed server-side in a column not returned by any API until reveal.
6. Allocation (inside payment txn): `SELECT id FROM pool_units WHERE campaign_id=? AND allocated=0 ORDER BY position LIMIT 1`, set allocated=1, insert allocation. `BEGIN IMMEDIATE` serialises writers, so no `SKIP LOCKED` is needed on SQLite.
7. On PREORDER_CLOSED: set `revealed_at`; seed becomes public.
8. `/verify/[campaign]`: before close shows commitment only; after close shows seed, recomputes shuffle and hash in the browser AND on the server, shows match/mismatch, lets the user download the order CSV. Also shows "your box was position N".
9. **Demo honesty:** the seeded demo campaign uses a fixed seed chosen so position 93 (the 94th box) is Eclipse Knight, keeping the walkthrough repeatable. The verify page and README must say so in plain words. The commitment still proves the order did not change after it was published.

Seed data: capacity 100 = Nova 21, Moss 21, Tide 21, Ember 21 (COMMON), Eclipse 7, Aurora 7 (RARE), Void 2 (SECRET). ASSUMPTION — founder may change counts; tests read counts from catalog.

## 9. C2C draw algorithm (`src/domain/draw.ts`, pure + `service.buyListing`)

For each box k in 1..N inside one `BEGIN IMMEDIATE` txn: read `remaining` per character; `total = Σ remaining`; if total=0 → throw `SOLD_OUT` and roll back; `r = crypto.randomInt(total)`; walk cumulative remaining in `listing_characters.id` order; pick; decrement that `remaining`; insert `c2c_draws(box_index=k, random_value=r, stock_snapshot=JSON before decrement)`. After loop, if all remaining=0 set listing SOLD_OUT. Draw happens at order creation (stock is held); if payment expires, set order EXPIRED and increment the drawn characters back in one txn, draws stay logged with order status EXPIRED. Buyer sees the result only after payment; seller sees the pick list after payment.

## 10. Mini-game

- P0 template: existing **fragment run** (`run`, reflex, 30 s, 15 waves) + existing **lore** challenge (accessible alternative). Second template = P2.
- Server issues session (seed, started_at). Client submits lane trajectory. Server recomputes score from seed, checks elapsed ≥ duration−2s and ≤ duration+20s, checks array length = waves. Win iff score ≥ `campaigns.required_score`.
- Attempts: max `attempts_per_day` sessions per user per campaign per SGT calendar day → 429 `ATTEMPT_LIMIT`.
- Rate limit: 20 POST/min per session token on `/api/loopbox` (in-memory, single host).
- CAPTCHA: NOT in MVP (needs third-party network keys) → P2, listed in RISKS.
- DEMO_MODE: a visible "Demo: win instantly" button on the quest page calls action `demoWin` which only exists when DEMO_MODE=true.
- Label in README: plausibility check, not authoritative anti-cheat.

## 11. Trade matching

Same campaign + same tier. Requester lists allocation with wishlist. Match search runs on insert (existing `listTrade`) and on admin "sweep" action: FIFO by `allocations.created_at`, 2-way reciprocal only. Both allocations → TRADE_PENDING atomically. Both accept → owners swap in one txn. Withdraw (`keep`) allowed while TRADE_LISTED. At ALLOCATION_LOCKED unmatched entries revert to OWNED. DEMO seed guarantees Sarah's Aurora Warden wants Eclipse Knight.

## 12. Stripe (test mode only)

- `src/server/stripe.ts` creates Checkout Sessions: `mode:'payment'`, one line item with `price_data` (currency `sgd`, `unit_amount` from DB, never from client), `metadata:{kind, order_id, user_id, campaign_id|listing_id}`, `client_reference_id=order_id`, `success_url=/checkout/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url=/checkout?cancelled=1`, `expires_at` = now + minimum allowed by Stripe (verify the minimum in Stripe docs; do not guess).
- `POST /api/stripe/webhook`: read raw body, verify with `stripe.webhooks.constructEvent` and `STRIPE_WEBHOOK_SECRET`; on failure 400. Insert `webhook_events` id; if duplicate → 200 and stop. Handle `checkout.session.completed` (payment_status `paid`) → order PAID + reservation REDEEMED + allocation (B2C) or PAID_HELD + payout HELD (C2C), all in one txn. Handle `checkout.session.expired` → EXPIRED + release seat/stock. If cap was taken meanwhile: mark `REFUNDED` in DB, audit, and create a Stripe refund (test mode).
- The success page NEVER allocates. It polls `GET /api/loopbox` until the order is PAID.
- `POST /api/stripe/simulate` exists only when `DEMO_MODE=true` and `STRIPE_SECRET_KEY` is empty or `SIMULATE_PAYMENTS=true`; it runs the same internal handler with a synthetic event id and marks payment `SIMULATED`. UI must label it "Simulated payment (demo)".
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, `SIMULATE_PAYMENTS`. Secret key is server-only; never prefixed `NEXT_PUBLIC_`.
- The founder's existing Payment Links are NOT used (cannot bind to a reservation).
- Local webhooks: `stripe listen --forward-to 127.0.0.1:3000/api/stripe/webhook`.

## 13. C2C rules

- Verification gate: email + phone OTP. MVP: OTP code generated server-side, stored hashed, expires 10 min, 5 tries; in DEMO_MODE the code is shown on screen. Real SMS/Singpass = FUTURE.
- Listing validation: title 4–80 chars; 2–12 characters; each declared 1–500; price 100–100000 cents; ≥1 photo.
- Uploads: `image/png|jpeg|webp` by magic-byte sniff (not extension), ≤ 2 MB, max 6 per listing, stored under `data/uploads/<uuid>.<ext>`, served by a route that sets `Content-Type` from DB and `X-Content-Type-Options: nosniff`.
- Payment: in-app Stripe only. Chat shows a fixed banner: "Pay only through LoopBox. Payments outside the app are not protected."
- Fee: `fee = max(50, round_half_up(subtotal × 800 / 10000))`, i.e. 8%, min S$0.50 (ASSUMPTION — founder sets final %). `seller_owed = subtotal − fee`.
- Chat: only buyer and seller of a paid order; 1000 chars max; 30 messages per 10 min per user; rendered as text (no HTML); polling every 5 s.
- Receipt window: 7 days after FULFILLED; admin "sweep" auto-completes older ones.
- Report: buyer can report while PAID_HELD or FULFILLED; admin marks UPHELD or DISMISSED.
- Trust score: `100 − 25×upheld_reports + 2×completed_orders`, clamped 0–100. Below 50 → all listings SUSPENDED. Shown on listing and seller cards.
- Sellers cannot buy their own listing (DB CHECK + 403).

## 14. B2B rules

- Application fields: common (org name, contact email, proposed series, IP ownership statement checkbox + text); BRAND adds website + proof of rights URL; COLLECTIVE adds member count + portfolio URL.
- Admin approves → creates `partners` + `partner_members(OWNER)` + sets user role BUSINESS.
- Partner edits campaign only in DRAFT/INFO_REQUESTED. After publish: counts, price, capacity are read-only (409 `LOCKED_AFTER_LIVE`).
- Dashboard formulas: plays = game_sessions; wins = sessions with score ≥ required; win rate = wins/plays; paid = orders PAID|DEMO_PAID; sell-through = paid/capacity; trades = matches ACCEPTED; revenue = paid × price; partner share = revenue × revenue_share_bps / 10000 (integer cents, floor).
- Manifest CSV: `campaign_id,character_id,character_name,rarity,quantity` one row per character + total row; quantity counted from allocations in final state. Filename `manifest-<campaign>-<yyyymmdd>.csv`.

## 15. API contract

All JSON errors are `{ "error": "<CODE>" }`. Codes: 400 INVALID_INPUT, 401 SIGN_IN_REQUIRED, 403 FORBIDDEN|INVALID_ORIGIN|VERIFICATION_REQUIRED, 404 NOT_FOUND, 409 INVALID_STATE|SOLD_OUT|LOCKED_AFTER_LIVE|ALREADY_DONE, 413 REQUEST_TOO_LARGE, 422 VALIDATION_FAILED, 429 ATTEMPT_LIMIT|RATE_LIMITED, 500 SERVER_ERROR.

Existing `GET /api/loopbox` (snapshot), `GET /api/loopbox?analytics` and `POST /api/loopbox {action}` stay. Every action is a member of the Zod discriminated union in `src/server/validation.ts`.

| Action / route | Role | Body (Zod) | Result |
|---|---|---|---|
| login | any (DEMO only) | user enum | ok |
| start | collector | mode | session |
| complete | collector | sessionId, values[] | win/lose + access |
| demoWin | collector, DEMO only | – | access |
| checkout (M5, replaces preorder) | collector | accessId, ageConfirmed: true | `{url}` or `{simulated:true, orderId}` |
| reveal / keep / trade / respond | owner | existing | existing |
| advance / edit | BUSINESS owner of campaign or ADMIN | existing | existing |
| waitlist | collector | – | ok |
| applyPartner | signed in | application schema | applicationId |
| decideApplication | ADMIN | id, decision, note | ok |
| saveDraftCampaign / submitCampaign | partner member | campaign schema | campaignId |
| publishCampaign / closeCampaign / sweep | ADMIN | campaignId | ok |
| sendOtp / verifyOtp | signed in | channel, code | ok |
| saveListing / publishListing / pauseListing | verified seller (own) | listing schema | listingId |
| buyListing | verified or not, not seller | listingId, quantity 1–10, ageConfirmed | `{url}` or simulated |
| fulfil | seller (own order) | orderId, note | ok |
| confirmReceipt / report | buyer (own order) | orderId, reason?, details? | ok |
| sendMessage | party of thread | threadId, body | message |
| `POST /api/stripe/webhook` | Stripe (signature) | raw | 200/400 |
| `POST /api/stripe/simulate` | DEMO only | orderId, kind | ok |
| `GET /api/manifest?campaign=` | partner member or ADMIN | – | text/csv |
| `GET /api/verify?campaign=` | public | – | commitment, seed?, positions? |
| `GET /api/market?q=&theme=&min=&max=&rarity=` | public | – | listings |
| `GET /api/chat?thread=&after=` | party | – | messages |
| `POST /api/upload` | verified seller | multipart ≤2 MB | path |

## 16. Screens (build these and no others)

Every screen: one primary action, loading state (skeleton, not spinner), empty state with the next action, error state saying what failed and what to do. Understandable in 5 seconds on a 390px phone.

Collector: `/` home · `/drop` campaign · `/quest` game · `/checkout` pay · `/checkout/success` waiting-for-payment · `/reveal/[id]` opening · `/collection` keep/trade · `/trades` trade room · `/verify/[campaign]` fairness.
C2C: `/market` browse · `/market/[id]` listing · `/sell/new` create listing · `/orders` my orders (buyer+seller tabs) · `/sell` seller dashboard · `/orders/[id]/chat` chat · `/me/verify` verification.
Partner: `/partners` landing + apply · `/partner` dashboard · `/partner/campaign/[id]` editor.
Admin: `/studio` (existing, becomes admin/partner console: applications, campaigns publish/close, orders, audit, reports).

Visual rules: see `DESIGN.md`. The visual target is `design/reference.html`.

## 17. Security

RBAC matrix:

| Capability | COLLECTOR | verified seller | BUSINESS (partner owner/member) | ADMIN |
|---|---|---|---|---|
| Play, reserve, buy B2C | ✓ | ✓ | ✗ | ✗ |
| Reveal/keep/trade own allocation | ✓ | ✓ | ✗ | ✗ |
| Create/publish listing | ✗ | ✓ | ✗ | ✗ |
| Buy C2C | ✓ (not own) | ✓ (not own) | ✗ | ✗ |
| Draft own campaign, view own dashboard/manifest | ✗ | ✗ | ✓ | ✓ |
| Publish/close campaign, decide applications, resolve reports, sweep | ✗ | ✗ | ✗ | ✓ |

IDOR tests (must exist): reveal another user's allocation; trade another user's allocation; respond to a match you're not in; read another partner's analytics/manifest; edit another seller's listing; fulfil another seller's order; confirm another buyer's order; read a chat you're not in; redeem another user's access.
Also: same-origin check on every POST (existing), 8 KB JSON body cap (existing), Zod on every input, React text rendering only (no `dangerouslySetInnerHTML` anywhere), upload sniffing, no emails/phones/tokens in `console.*` or audit detail, secrets only in server env.

## 18. Privacy & compliance

- Collect only: display name, email, phone (C2C sellers), age confirmation timestamp. No DOB, no NRIC.
- Every drop and listing shows odds or stock per character before purchase.
- Checkout requires "I am 18 or older" checkbox (server enforces `ageConfirmed:true`).
- Game is free, no purchase needed to play; say so on the quest page.
- Terms page placeholder at `/terms` headed "Draft — not legal advice".
- README section "LEGAL REVIEW REQUIRED": Gambling Control Act 2022 applicability to paid chance-based boxes and draws; consumer protection (fair trading) for preorders and refunds; PDPA; IP/licensing for Brand Collaborator drops; seller-declared stock liability; payments/escrow regulation for held funds.
- NEVER write "compliant", "legal", "licensed", "approved by" in UI or docs.

## 19. Seed & DEMO_MODE

On empty DB with DEMO_MODE=true seed:
- Users: Alex (collector, verified), Sarah (collector), Mei (verified seller, trust 96), Jun (verified seller, trust 88), Priya (verified seller, trust 100), Astral Studio (BUSINESS), Admin (ADMIN).
- Partner "Astral Studio" (BRAND) with campaign Astral Kin, capacity 100, counts per Section 8, 93 allocations already made (positions 0–92), commitment published, fixed demo seed.
- Partner "Kopi Kaki Collective" (COLLECTIVE) with a DRAFT campaign (5 characters) awaiting review.
- One SUBMITTED partner application ("Hawker Heroes", BRAND).
- Alex owns one Eclipse Knight already (so the new one is a duplicate). Sarah owns Aurora Warden, TRADE_LISTED, wishlist [Eclipse Knight].
- 3 ACTIVE listings (Mei, Jun, Priya) with 3–6 characters and stock; one listing with a single remaining rare.
- One PAID_HELD market order Alex←Mei with a 3-message chat thread.
- DEMO_MODE effects: quick identity switcher, `demoWin`, simulated payments when no Stripe key, OTP shown on screen. With DEMO_MODE=false all of these return 404.

## 20. Tests (all must pass before any milestone is reported done)

Unit (`tests/*.test.ts`): buildPool length; shuffle determinism; commitment recompute; fairness mismatch detection; C2C draw never picks remaining=0 and respects weights over 10k runs within tolerance (statistical test with fixed tolerance, not flaky); fee math table (incl. 1 cent, 625 cents, 100000 cents); trust formula; every state transition allowed/forbidden; matching same-tier only.
Concurrency: 50 parallel B2C payment confirmations for the last 3 units → exactly 3 allocations, others REFUNDED; 50 parallel C2C buys for 5 remaining → remaining never < 0 and total drawn ≤ 5.
Webhook: same event delivered 3× → one allocation; bad signature → 400.
IDOR: every case in Section 17.
E2E (Playwright, existing file extended): golden path with simulated payment; keep ALL existing assertions passing.

## 21. Agent operating rules (mandatory)

1. Read AGENTS.md, DESIGN.md, PROJECT_STATE.md at session start.
2. Before coding, print: the milestone objective in one sentence, the plan, and the exact files you will touch.
3. Implement only the current milestone. Do not start the next one.
4. Never invent an API. Check installed versions and docs first.
5. Never stub silently. Any placeholder is marked `// TODO(STUB): <what is missing>` and listed under STUBS.
6. Do not rewrite or reformat working code outside the milestone's file list.
7. After every change run, in order: `npm ci` (only if package.json changed), `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` at milestone end. Fix failures before reporting.
8. Never delete, skip (`.skip`, `.only`), or loosen a test to make it pass. If an existing e2e accessible name must change, you may not change it without the human's explicit approval in chat.
9. Commit after each green milestone: `git add -A && git commit -m "M<n>: <summary>"` and tag `m<n>-green`.
10. If blocked for more than 2 fix attempts on the same error, stop and report BROKEN with root cause.
11. The human cannot read code. Every report ends with a plain-English summary and click-by-click manual checks with the expected result at each step.

## 22. Report format (use exactly these headings)

```
VERIFIED: <command> → <result>   (one line per command actually run)
UNVERIFIED: <what you did not run and why>
BROKEN: <what fails, root cause>
STUBS: <every TODO(STUB)>
RISKS: <new risks>
IN PLAIN ENGLISH: <3–6 sentences, no jargon>
HOW TO CHECK IT YOURSELF:
  1. <click/type> → you should see <exact thing>
  ...
NEXT: <the next milestone name, not started>
```

## 23. PROJECT_STATE.md (rewrite after every milestone)

```
GOAL:
DONE:
IN PROGRESS:
BLOCKED:
BUGS:
DECISIONS:
NEXT 3 ACTIONS:
LAST GREEN TAG:
```

## 24. Protected strings (Playwright depends on them — keep the exact accessible names)

Headings: contains "A little mystery"; "Astral Kin™"; "Quest cleared."; "Eclipse Knight"; "Two kin. Two happy collectors."; "Aurora Warden"; "Demand, before making."; "Ready to make.".
Links: "Explore the drop"; "Claim preorder slot"; "Find a trade"; "See my updated collection"; "Trade room".
Buttons: "Play to unlock"; "Untimed lore challenge" (regex); "Start lore challenge"; "Start quest"; "Pause quest"; "Resume"; "Open my box"; "Save card"; "Find my match"; "Accept exchange"; "Advance campaign"; "Confirm phase change"; "Edit campaign"; "Save campaign"; "Sold out · Join waitlist"; "You’re on the waitlist"; "Open menu"; regex "Demo collector".
Text: "7 remaining"; regex "You have a duplicate"; "Exchange complete.".
Selectors: `.countdown`, `.fragment`, `input[name="nova"]`, `input[name="price"]`, `main h1`, `canvas`, role `img` named "Eclipse Knight collectible", role `dialog`, role `checkbox`.
M5 will replace "Confirm demo preorder" with the Stripe flow; update that ONE e2e step to the new button "Pay with card" in the same commit and report it.
