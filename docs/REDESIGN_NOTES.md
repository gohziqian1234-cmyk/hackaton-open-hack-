# LoopBox v2 redesign notes

Working notes for the v2 kit (`loopbox-v2-kit/`, brief in `loopbox-v2-kit/CODEX_MASTER_PROMPT.md`).
Updated at the end of every phase.

## 0. What was already here (inspection)

| Area | Finding |
|---|---|
| Framework | Next.js 16 App Router, React 19.2, TypeScript 5.9, Zod 4. Client pages share one `Provider` (`src/components/provider.tsx`) that holds the JSON snapshot from `GET /api/loopbox`. |
| Styling | Plain CSS with custom properties: `src/app/globals.css` (v1 "Night Counter") plus the new `src/app/v2.css`. No Tailwind, no CSS-in-JS. Fonts: Unbounded (display) + Figtree (body) via `@fontsource-variable`. |
| Database | SQLite through Node's built-in `node:sqlite` (`src/server/db.ts`), forward-only migrations in `src/server/schema.ts` (`PRAGMA user_version`), every write in `BEGIN IMMEDIATE`. Runtime file `data/loopbox.sqlite` (git- and docker-ignored). |
| Services | One class chain: `Loopbox` (`service.ts`, B2C core) → `Partners` (`partners.ts`) → `Market` (`market.ts`, C2C) → **`Drops` (`drops.ts`, new in v2)** → `App` (`app.ts`). Routes call `openService()`. |
| Auth | Email + password accounts (scrypt, hashed session tokens, lockout) and, in `DEMO_MODE`, one-click demo identities. Cookie `loopbox_session`. (The brief says "email + code login"; the repo actually uses email + password. Code-by-email exists only for seller verification.) |
| Payments | **Not Payment Links.** The repo creates Stripe Checkout Sessions in test mode (`src/server/stripe.ts`), verifies the webhook signature (`/api/stripe/webhook`), dedupes events, and allocates only inside the verified webhook handler. With no Stripe key and `DEMO_MODE=true` the same handler runs from `/api/stripe/simulate` ("Simulated payment (demo)"). AGENTS.md §12 forbids the founder's Payment Links because they cannot be bound to a reservation, so v2 keeps Checkout Sessions for Astral Kin. |
| Astral Kin data | Campaign `astral` in `campaigns`, 7 characters in `characters` (catalogue copy in `src/lib/catalog.ts`), 100 committed pool units in `pool_units`, fingerprint in `fairness_commitments`. Art is drawn in code: `KinArt` / `BoxArt` SVGs (`src/components/art.tsx`) and the 3D stage (`stage.tsx`, `scene.tsx`). There is **no raster Astral Kin image**, so its theme `cover_image` stays empty and its cover is composed from its own SVG art. |
| Pages (before v2) | Home `src/app/page.tsx` → `Discovery` (`components/discovery.tsx`); The drop `/drop` → `Drop` (same file); My collection `/collection` → `components/collection.tsx`; Trade room `/trades` → `components/trades.tsx`; Marketplace `/market`, `/market/[id]` → `components/market.tsx`; For partners `/partners` → `components/partners.tsx`; checkout/success/reveal → `components/purchase.tsx`. |
| Static files | Served from `public/` (created by v2; the repo had none). Kit images copied to `public/images/themes/`. |

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
  seed. CLI: `npm run seed:themes` (needs a migrated database; start the app once first).
- Odds shown to users = `units / capacity` as a whole percent.
- Image helper `src/lib/images.ts`: `getCharacterImage(theme, character, variant)` and
  `getThemeCover(theme)` read the manifest and return `{ src, width, height }`. Astral Kin returns
  `kind: 'original'` (its own SVG art); anything else without an image gets a neutral tile (theme accent,
  character initial) and a development-only console warning.
- `CharacterImage` / `CharacterTile` (`src/components/character-image.tsx`) are the only places that
  render character pictures. The robot `KinArt` remains only as Astral Kin's own artwork; marketplace
  series, partner drafts and the C2C reveal now show neutral initial tiles.

## Out-of-scope issues found
- `Dockerfile` does not copy `public/` into the runtime image, so kit images would 404 in a Docker
  deployment. The Render Blueprint (the documented deploy) builds natively and is unaffected.
  Not changed (deployment config is scope-locked). Fix: add `COPY --from=build /app/public ./public`.
