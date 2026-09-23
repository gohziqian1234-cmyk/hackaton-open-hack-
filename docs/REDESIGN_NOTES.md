# LoopBox v2 redesign notes

Working notes for the v2 kit (`loopbox-v2-kit/`, brief in `loopbox-v2-kit/CODEX_MASTER_PROMPT.md`).
Updated at the end of every phase.

## 0. What was already here (inspection)

| Area              | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework         | Next.js 16 App Router, React 19.2, TypeScript 5.9, Zod 4. Client pages share one `Provider` (`src/components/provider.tsx`) that holds the JSON snapshot from `GET /api/loopbox`.                                                                                                                                                                                                                                                                                                                              |
| Styling           | Plain CSS with custom properties: `src/app/globals.css` (v1 "Night Counter") plus the new `src/app/v2.css`. No Tailwind, no CSS-in-JS. Fonts: Unbounded (display) + Figtree (body) via `@fontsource-variable`.                                                                                                                                                                                                                                                                                                 |
| Database          | SQLite through Node's built-in `node:sqlite` (`src/server/db.ts`), forward-only migrations in `src/server/schema.ts` (`PRAGMA user_version`), every write in `BEGIN IMMEDIATE`. Runtime file `data/loopbox.sqlite` (git- and docker-ignored).                                                                                                                                                                                                                                                                  |
| Services          | One class chain: `Loopbox` (`service.ts`, B2C core) → `Partners` (`partners.ts`) → `Market` (`market.ts`, C2C) → **`Drops` (`drops.ts`, new in v2)** → `App` (`app.ts`). Routes call `openService()`.                                                                                                                                                                                                                                                                                                          |
| Auth              | Email + password accounts (scrypt, hashed session tokens, lockout) and, in `DEMO_MODE`, one-click demo identities. Cookie `loopbox_session`. (The brief says "email + code login"; the repo actually uses email + password. Code-by-email exists only for seller verification.)                                                                                                                                                                                                                                |
| Payments          | **Not Payment Links.** The repo creates Stripe Checkout Sessions in test mode (`src/server/stripe.ts`), verifies the webhook signature (`/api/stripe/webhook`), dedupes events, and allocates only inside the verified webhook handler. With no Stripe key and `DEMO_MODE=true` the same handler runs from `/api/stripe/simulate` ("Simulated payment (demo)"). AGENTS.md §12 forbids the founder's Payment Links because they cannot be bound to a reservation, so v2 keeps Checkout Sessions for Astral Kin. |
| Astral Kin data   | Campaign `astral` in `campaigns`, 7 characters in `characters` (catalogue copy in `src/lib/catalog.ts`), 100 committed pool units in `pool_units`, fingerprint in `fairness_commitments`. Art is drawn in code: `KinArt` / `BoxArt` SVGs (`src/components/art.tsx`) and the 3D stage (`stage.tsx`, `scene.tsx`). There is **no raster Astral Kin image**, so its theme `cover_image` stays empty and its cover is composed from its own SVG art.                                                               |
| Pages (before v2) | Home `src/app/page.tsx` → `Discovery` (`components/discovery.tsx`); The drop `/drop` → `Drop` (same file); My collection `/collection` → `components/collection.tsx`; Trade room `/trades` → `components/trades.tsx`; Marketplace `/market`, `/market/[id]` → `components/market.tsx`; For partners `/partners` → `components/partners.tsx`; checkout/success/reveal → `components/purchase.tsx`.                                                                                                              |
| Static files      | Served from `public/` (created by v2; the repo had none). Kit images copied to `public/images/themes/`.                                                                                                                                                                                                                                                                                                                                                                                                        |

### Where the kit data lives (deviation, on purpose)

The brief copies `themes.seed.json` and `image-manifest.json` to `data/`. In this repo `data/` is the
SQLite runtime folder and is excluded by both `.gitignore` and `.dockerignore`, so files there would
never reach git or a build. They live in **`src/data/`** instead and are bundled at build time.
`node loopbox-v2-kit/scripts/verify-assets.mjs public` still checks the kit copy of the data against
`public/`. Only the kit's `README.md`, `CODEX_MASTER_PROMPT.md`, `data/` and `scripts/` are committed;
`loopbox-v2-kit/reference/` (24 MB of screenshots, videos and original posters) and the duplicate
`loopbox-v2-kit/public/` are git-ignored.

## Phase 1 — assets, seed, image helper

- Images: `public/images/themes/{naruto,edgerunners}/` copied as-is. `npm run verify:assets` → `30 files OK, 0 problem(s).`
- Migration 9: table `themes` (slug, name, status, payment_mode, is_licensed_concept, sort_order,
  tagline, description, accent, accent_secondary, price_cents, unit_cap, per_person_max,
  slot_hold_minutes, reservation_minutes, closes_at, cover_image, campaign_id) and column
  `characters.slug` (image key inside the theme).
- The brief's `characters(stock_total, stock_left)` already exist as `characters.units` (stock total)
  and the committed pool (`pool_units`); stock left = units not yet drawn. No duplicate table.
- Seeder `src/server/themes.ts` (`seedThemes`): idempotent upsert by slug. Live themes with their own
  characters get a campaign (`naruto`, `edgerunners`) with a freshly shuffled, fingerprinted pool —
  only the first time. Re-runs update names and lore, never stock, prices, the pool or `closes_at`.
  Astral Kin (`use_existing_characters`) only links its theme row to campaign `astral`.
- It runs automatically on every database open (`createDatabase` → `upsertThemes`) and inside the demo
  seed. CLI: `npm run seed:themes` (opens, migrates and seeds the database if needed).
- Odds shown to users = `units / capacity` as a whole percent.
- Image helper `src/lib/images.ts`: `getCharacterImage(theme, character, variant)` and
  `getThemeCover(theme)` read the manifest and return `{ src, width, height }`. Astral Kin returns
  `kind: 'original'` (its own SVG art); anything else without an image gets a neutral tile (theme accent,
  character initial) and a development-only console warning.
- `CharacterImage` / `CharacterTile` (`src/components/character-image.tsx`) are the only places that
  render character pictures. The robot `KinArt` remains only as Astral Kin's own artwork; marketplace
  series, partner drafts and the C2C reveal now show neutral initial tiles.

## Phase 2 — design tokens and homepage

- Tokens in `src/app/globals.css` `:root`: `--bg #14112A`, `--surface #1C1838`, `--surface-2 #252048`,
  `--border`, `--text #F2F0FF`, `--text-muted #A9A3CF`, `--primary #FFD84D`, `--live #5EEAD4`, rarity
  `--common #E5E7EB` / `--rare` (= theme accent) / `--secret #F5C542`; type scale `--fs-1…6` =
  13/16/20/28/44/72; spacing `--s1…10` = 4…160; radii exactly `--r-sm 10px` and `--r-lg 20px` (pill only
  for buttons); motion `--t-hover 150ms`, `--t-ui 300ms`, `--t-reveal 600ms`, all off under
  `prefers-reduced-motion`. The v1 names (`--ink`, `--orbit`, `--moon`, `--star`…) are re-pointed to them,
  so every existing screen follows the new palette without edits. One icon set (lucide), no emoji.
- `src/components/home.tsx`: asymmetric 12-column hero (7 text / 5 visual bleeding 40px), the Astral Kin
  stage on a radial glow with SVG noise and a −6° "93 of 100 claimed" sticker, a hand-drawn underline that
  draws in once, a 20-block segmented live bar ("7 left · closes in 6d 14h"), the checkout banner, a
  divider value band, a six-step timeline (vertical on mobile) that highlights the signed-in collector's
  step, an uneven "Now dropping" strip (one 2/3 + two stacked), the ecosystem strip and a new footer. Sections
  fade up 16px on first scroll (IntersectionObserver; only below-the-fold ones, so nothing visible blinks).
- Nav: Drops · My collection · Trade room · Marketplace · For partners · Checkout (badge = opened figures).
  Footer links use short labels so no link name appears twice (an e2e test relies on unique names).

## Phase 3 — drops browser, "To be continued", drop pages

- `/drops` (`src/components/drops.tsx`): tabs All / Live now / Coming soon in `?tab=`; 2-column grid ≥ 900px;
  each card is one link with a 16:10 cover (kit `cover.webp`, Astral Kin's own art, or abstract art), LIVE /
  COMING SOON tag, `● N left` / Notify me, concept badge, uppercase title, 2-line description and chips
  (price, characters, rarity mix, closes in). Published partner campaigns without a theme row are listed after
  the seeded themes.
- `/drops/[slug]` (slug or campaign id): coming-soon themes render "To be continued…" over blurred abstract
  art with **Notify me** (table `theme_interest`, migration 10; logged-out → sign in → returns and finishes).
  Live themes render the data-driven drop page: `● N remaining` in the theme accent, name (™ only for
  non-licensed), concept badge, lineup with kit `card` images, rarity pill and whole-percent odds, secrets
  blurred with "Secret · 5%" until one has been pulled, and a lightbox (`hero`, tab to `poster`, lore, odds,
  badge, "Concept render"). Sticky light price panel as before. `/drop?campaign=` redirects.
- Coming-soon art (`AbstractArt`): accent mesh gradient + noise + the theme name in 8%-opacity outline type.
- The quest is skinned with the theme name and accent; non-Astral themes use an abstract orb as the runner.

## Phase 4 — checkout and the order-item state machine

- Migration 11: `order_items` (`opened → confirmed → in_production → shipped`, side exits `declined`,
  `expired`; `access_id` UNIQUE; partial unique index on held `pool_unit_id`) and `item_orders` (every
  payment attempt of an item, with a `basket_id`). `slot_won` is the existing `access` row (AVAILABLE).
- Opening (`openSlot`) draws the lowest free position of the committed shuffle — the **same allocation
  rule** as before — holds it for `reservation_minutes` (30) and consumes the slot. The legacy pay-first
  path skips held units.
- **Anti-abuse (tests in `tests/checkout.test.ts`)**: no re-draw after decline; expiry returns stock once
  (lazy on every read + admin sweep); per-person max counts slots won; confirming requires age and
  "made just for me".
- `/checkout` (`src/components/checkout.tsx`): items grouped by theme with `card` image, rarity, theme,
  concept badge, price, live countdown, select checkbox and **Decline** (small confirm dialog); sticky summary
  with count, subtotal (or "Real payment (Astral Kin)" / "Demo payment (concept drops)"), flat demo shipping
  S$3.50 (shown, never charged), total, production note, 18+ checkbox and **Checkout**; the native-dialog
  modal "Are you sure you want these made?" (focus trap, Esc, focus return) with thumbnails, the made-to-order
  text, required checkbox, **Yes, confirm & pay** / **Go back**; concept items first get the **Demo payment**
  sheet (**Complete demo payment**), then card items redirect to Stripe. Home shows the checkout banner.
- Payment: Astral Kin keeps the repo's **Stripe Checkout Session + signed webhook** (not Payment Links — see
  §0). One session can pay several figures (`order_ids` metadata, partial refunds if some figures were lost
  meanwhile). `/checkout/success?basket=…` polls until the server says paid, then shows "Confirmed. You're on
  the production list.", the figures, order number `LB-XXXXXXXX`, a 4-step timeline and **Find a trade**.
- "Trade it" on an unpaid figure opens the trade room with a note: trades are between confirmed figures, so
  confirm first (the trade-room logic itself is unchanged).

## Phase 5 — opening animation

- `src/components/opening.tsx` `OpeningSequence({ theme, character, onComplete, onTrade, … })`, used by
  `/open/[slot]` (new slots), `/reveal/[id]` (v1 paid boxes) and QR claims (reveal only). The server draws on
  the first tap and the images are preloaded before the box animates.
- Stage 1: CSS 3D cube (LoopBox mark, accent edges), float + wobble, rotating accent sunburst; tap → squash,
  stretch, three shakes, lid flips off (rotateX −110°, −120px), light burst, canvas particles.
- Stage 2: LoopBox-branded foil pack (crimped edges via clip-path, holographic sheen following the pointer),
  hand hint "Swipe across the pack to tear it open".
- Stage 3: pointer stroke with a tapered white-to-accent canvas trail; valid = one stroke that enters, crosses
  ≥ 60% of the pack width and leaves (`src/lib/slice.ts`, unit-tested); invalid → wobble + "Swipe all the way
  across"; valid → 80ms hit-stop, the pack splits along the real stroke into two clip-path halves that fly
  apart, foil confetti, `navigator.vibrate(30)`. After 5s: **Tap here to tear instead**.
- Stage 4: `card` (mobile) / `hero` (desktop) rises in a rarity glow (common white, rare accent, secret gold +
  rays + flash, 1.5× slower), rarity, name, theme, badge, "1 of {cap} made in this drop", **Keep it — go to
  checkout** / **Trade it**.
- **Skip** (top-right), sound toggle (off by default, synthesised, top-left), `aria-live` result, keyboard
  path (Enter on the box, Enter on the focused pack), reduced motion → instant stages and a **Tear open** button.
  Site chrome is hidden while it plays.

## Phase 6 — My collection: Add more by QR

- Migration 12: `physical_items (code_hash UNIQUE, theme_id, character_id, serial_no, claimed_by,
claimed_at)`; codes are 128-bit random base32 (26 chars), only SHA-256 stored (`src/server/physical.ts`).
- **Add more** sheet (`src/components/scanner.tsx`): camera via `getUserMedia` + `jsqr` (lazy-loaded) with a
  framing square, **Upload a photo of the QR**, **Enter code manually**; messages for camera denied (how to
  allow + fallbacks), no camera, insecure context, invalid code, already yours, someone else's, too many tries.
  Success replays Stage 4 and the figure appears with **Verified physical** and `#014 / 100`. Tabs
  All · Digital pulls · Physical. `/claim/[code]` runs the same claim (logged out → sign in → back).
- Claims are rate limited to 10/min per account and per address. **Camera needs HTTPS** (Render provides it;
  `localhost` is allowed). `next.config.ts` now sends `Permissions-Policy: camera=(self)` (was `camera=()`).
- Codes: `npm run seed:physical` makes 20 per live theme (`PHYSICAL_COUNT` to change), spreads them across
  characters by stock with running serials, prints them **once**, and writes a printable A4 sheet to
  `data/qr-sheet-<time>.html`. **Deviation:** `/admin/qr-sheet` cannot re-display seeded codes (only hashes are
  kept, as the brief requires); instead admins **Generate codes** there and **Print sheet** straight away.
  Admin = the existing ADMIN role.

## Phase 7 — marketplace storefront

- Removed the "Creator marketplace" eyebrow, the "Blind boxes, made by collectors." headline, its paragraph
  and the big "Sell your series" button. New: H1 **Marketplace**, one line, **Sell on LoopBox →**; a trust strip;
  a toolbar (search, theme, rarity, price from/to, **Sort**: newest, price low–high, high–low, most stock,
  top-rated sellers) synced to the URL, and a results count.
- Cards: lineup art (seller photo or neutral initial tiles — no more robots), series name, theme tag, price
  as the largest text, stock bar "10 of 40 left", "3 characters · 1 rare", "Ships within 3 days", seller row
  (initial, name, trust badge, Verified). Whole card is one link.
- Series page: seller identity, price, buyer-protection box (held payment, hand-over time, disputes and
  returns line) above the existing stock-and-odds table. Purchase logic unchanged; the listing query only
  gained read-only fields and `sort`.
- "Ships within 3 days" is a **demo policy assumption** (`HANDOVER_DAYS`), not a seller setting.

## Phase 8 — QA results

| Check                               | Result                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify:assets`             | 30 files OK, 0 problems                                                                                                                                                                                                                                                                                                                                                                                                               |
| Search for the removed theme's name | only the brief and the kit mention it; no code, data, route or text                                                                                                                                                                                                                                                                                                                                                                   |
| Typecheck / lint                    | clean (the one lint warning is ESLint's own note about the ignored `next-env.d.ts`)                                                                                                                                                                                                                                                                                                                                                   |
| Unit tests                          | 173 passed (18 files)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| E2E (Playwright, Chromium)          | 12 passed: golden path (quest → open → checkout → trade → close → manifest → verify), keyboard game, 375px/reduced motion/no WebGL, API boundaries, concurrency across processes, partner portal, two marketplace journeys, every route at 390px with axe (now incl. `/drops`, `/drops/naruto`, `/drops/sanrio`), the opening sequence (swipe, short swipe, keyboard, tap fallback, reduced motion) + concept checkout, and QR claims |
| Lighthouse mobile accessibility     | 100 on `/`, `/drops`, `/drops/naruto`, `/checkout`, `/market`, `/collection` (Lighthouse 12, headless Chromium)                                                                                                                                                                                                                                                                                                                       |
| Camera scan                         | verified with Chromium's fake webcam fed a generated QR video: decoded and claimed                                                                                                                                                                                                                                                                                                                                                    |
| Horizontal scroll at 390px          | none (e2e + screenshot script)                                                                                                                                                                                                                                                                                                                                                                                                        |
| Screenshots                         | `docs/screens/*-1440.png` and `*-390.png` for every new or changed page (26 pages × 2)                                                                                                                                                                                                                                                                                                                                                |

## New routes

`/drops`, `/drops/[slug]`, `/open/[slot]`, `/checkout` (rebuilt), `/checkout/success?basket=`, `/claim/[code]`,
`/admin/qr-sheet`. `/drop` now redirects. New actions on `POST /api/loopbox`: `notifyTheme`, `openSlot`,
`declineItem`, `confirmItems`, `claimPhysical`, `generatePhysical`. `GET /api/market` accepts `sort`.

## New tables and columns

Migration 9 `themes`, `characters.slug`; 10 `theme_interest`; 11 `order_items`, `item_orders`; 12
`physical_items`. Nothing dropped or renamed.

## How to run

```bash
npm ci
npm run build && npm start          # themes are upserted on every start
npm run seed:themes                 # re-apply src/data/themes.seed.json (idempotent)
NEXT_PUBLIC_APP_URL=https://your-site npm run seed:physical   # 20 codes per live theme, printed once
# QR sheet in the app: sign in as Admin → /admin/qr-sheet → Generate codes → Print sheet
npm run typecheck && npm run lint && npm test && npm run test:e2e
npm run verify:assets
```

## Scope lock

Not changed: auth, trade-room logic (only its pictures and a "confirm first" note), For partners content and
logic, C2C seller flow logic (only the character tiles in the editor), the draw/fairness algorithm (still the
lowest free position of the committed shuffle — opened figures now hold their unit until paid, declined or
expired), deployment config (`Dockerfile`, `render.yaml`). Changed on purpose: `Permissions-Policy` camera for
the QR scanner (security headers in `next.config.ts`).

Protected e2e strings changed because the brief changes those screens: "A little mystery" → "Collect the
surprise", "Explore the drop" → "Explore the drops", "Pay with card" → "Checkout" + "Yes, confirm & pay",
"Blind boxes, made by collectors." → "Marketplace". One existing unit assertion was scoped to the campaign
it tests (it counted unsold units across _all_ campaigns; the new concept drops add 160).

## Known limitations / TODOs

- Mixed baskets settle concept figures immediately; if the card payment for the Astral Kin part is then
  abandoned, those figures go back to checkout until their reservation ends.
- "Real payment (Astral Kin)" is Stripe **test** mode; no real money anywhere.
- Shipping S$3.50 and "3–4 weeks after close" / "within 3 days" are displayed assumptions, not charged or
  enforced.
- The lore quiz questions are generic LoopBox questions for every theme.
- Seeded QR codes can't be re-printed (by design); make a new batch instead.

## Out-of-scope issues found

- `Dockerfile` does not copy `public/` into the runtime image, so kit images would 404 in a Docker
  deployment. The Render Blueprint (the documented deploy) builds natively and is unaffected.
  Not changed (deployment config is scope-locked). Fix: add `COPY --from=build /app/public ./public`.
