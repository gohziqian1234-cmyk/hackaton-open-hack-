# LOOPBOX v2 — CODEX MASTER PROMPT

You are a senior product designer (UX/UI, 15+ years on consumer commerce and collectibles apps) AND a senior full-stack engineer. You are working in the existing **LoopBox** repo: a limited-drop, made-to-order blind-box platform built for NYP Open Hack. Judges will click through it live. Treat it as a real startup product.

A kit folder `loopbox-v2-kit/` is in the repo root. It contains the seed data, every character image (already cropped and sized), a verification script and reference screenshots/videos. **Use it. Do not invent data, images, paths or character names.**

Read this whole prompt before writing code. Then do the phases in order. After each phase, run the checks listed for that phase and fix failures before moving on.

---

## 0. HARD RULES

1. **Inspect first.** Read the repo: framework, router, styling system, DB layer (SQLite), auth (email + code login), Stripe Payment Links, and the existing pages (Home, The drop, My collection, Trade room, Marketplace, For partners). Write what you found to `docs/REDESIGN_NOTES.md` (stack, file locations of each page, where Astral Kin data lives, how payment currently works). Use the existing stack and conventions. Do NOT add a new framework or CSS system.
2. **Read the kit.** Open and read: `loopbox-v2-kit/README.md`, `data/themes.seed.json`, `data/image-manifest.json`, and look at every image in `loopbox-v2-kit/reference/ui/` and `reference/animation/` (the `*-frames.png` sheets show the videos frame by frame).
3. **Scope lock.** Only change what Section 2 lists. Do NOT change: auth, Trade room logic, For partners content/logic, C2C seller flow logic, the draw/fairness algorithm, deployment config. You may ADD tables/columns; never drop or rename existing ones. If something out of scope looks broken, write it under "Out-of-scope issues found" in `REDESIGN_NOTES.md` instead of changing it.
4. **Keep the brand.** Keep the current dark identity (see `reference/ui/02-current-dark-homepage-THEME-source.png`): deep indigo/navy background, warm yellow primary, mint "live" accent, the chunky display font, the LoopBox cube logo.
5. **No character drawing.** Never draw or approximate any Naruto, Cyberpunk: Edgerunners or other licensed character in SVG/CSS/canvas. Character visuals come ONLY from `loopbox-v2-kit/public/images/themes/`. Coming-soon themes use abstract art (Section 4.4).
6. **Licensed themes are concept demos.** Naruto and Cyberpunk: Edgerunners are third-party IP the team has no license for. When `is_licensed_concept` is true:
   - Show a visible badge `Concept partner drop — demo only, not licensed` on the theme card, drop page, reveal screen, checkout rows and collection tiles.
   - Put a small caption `Concept render` under any `hero` or `poster` image.
   - Checkout uses **demo payment mode** (`payment_mode: "demo"`), never Stripe.
   Only **Astral Kin** (`payment_mode: "stripe"`) uses real Stripe Payment Links.
7. **Data-driven only.** Themes, characters, rarities, stock, prices, accents, images come from the seed file / DB. No character names or image paths hard-coded in components.
8. **Pokémon is removed.** If any earlier work in the repo added a Pokémon theme, data, route or asset, delete it completely.
9. **Commit per phase** with clear messages.

---

## 1. PRODUCT CONTEXT

- **B2C flow (new order):** pick a theme → play the themed mini-game (free) → win a preorder slot (held 15 min) → open a digital blind box (fair draw from published stock, with the new opening animation) → optional same-rarity trade → **Checkout: "Are you sure you want this made?" → pay** → only confirmed orders go to in-house 3D-print production → ship.
- **B2B:** brands/creators apply on For partners (unchanged).
- **C2C Marketplace:** verified users sell their own blind-box series; platform draws from the seller's stock; payment held until the buyer confirms receipt.
- Core promise: **"Produce only what's wanted."**

---

## 2. WHAT TO BUILD

| Phase | Item | Section |
|---|---|---|
| 1 | Install kit assets + seed data + image helper | 3 |
| 2 | Design tokens + homepage rebuild | 4 |
| 3 | Drops theme browser + "To be continued" page + drop detail pages | 5, 6 |
| 4 | Checkout page (payment moves here) + state machine | 7 |
| 5 | Opening animation (box → foil pack → swipe → reveal) | 8 |
| 6 | My collection: Add more → scan QR | 9 |
| 7 | Marketplace storefront redesign | 10 |
| 8 | Full QA + report | 11, 12 |

---

## 3. PHASE 1 — ASSETS, SEED, IMAGE HELPER

### 3.1 Copy assets (exact commands, adapt only if `public/` is named differently in this repo)
```bash
mkdir -p public/images/themes
cp -R loopbox-v2-kit/public/images/themes/naruto public/images/themes/
cp -R loopbox-v2-kit/public/images/themes/edgerunners public/images/themes/
mkdir -p data
cp loopbox-v2-kit/data/themes.seed.json data/themes.seed.json
cp loopbox-v2-kit/data/image-manifest.json data/image-manifest.json
node loopbox-v2-kit/scripts/verify-assets.mjs public
```
The verify script must print `0 problem(s)`. If the repo serves static files from another folder (e.g. `static/`, `app/static/`), copy there instead and pass that folder to the script. Record the choice in `REDESIGN_NOTES.md`.

### 3.2 Image variants (already made; do not resize or re-crop)
| Variant | Size | Where to use |
|---|---|---|
| `card` 600×600 | drop lineup, collection tiles, trade room, checkout rows, reveal (mobile) |
| `thumb` 200×200 | small avatars, marketplace mini-previews, confirmation modal lists |
| `hero` 800×1200 | homepage hero, character detail view, reveal (desktop) |
| `poster` 1024×1536 | ONLY in the character detail lightbox, with concept badge |
| `cover.webp` 1600×1000 | theme card on `/drops` |

Display rules: `object-fit: cover`, `object-position: center top` for `card`/`thumb` (faces are in the upper half). Always set `width`/`height` attributes from the manifest to avoid layout shift. `loading="lazy"` except above-the-fold hero. Alt text: `"{character name}, {rarity} figure from {theme name} (concept render)"`.

### 3.3 Seed
- Write an idempotent seed script (e.g. `scripts/seed-themes.(js|py)` matching the repo language) that upserts themes and characters from `data/themes.seed.json`.
- Tables to add if missing: `themes (id, slug unique, name, status, payment_mode, is_licensed_concept, sort_order, tagline, description, accent, accent_secondary, price_cents, unit_cap, per_person_max, slot_hold_minutes, reservation_minutes, closes_at, cover_image)` and `characters (id, theme_id, slug, name, rarity, stock_total, stock_left, lore)`. If the repo already has equivalents for Astral Kin, extend those instead of duplicating.
- `closes_at` = now + `closes_in_days` at first seed only (don't reset on re-run).
- Astral Kin: `use_existing_characters: true` → keep its existing characters/images/stock untouched; only upsert its theme-level fields. For its `cover_image`, use the existing Astral Kin image path you found in step 0.
- Odds shown to users = `stock_total / unit_cap`, formatted as a whole percent (e.g. Itachi 5%, Lucy 5%).

### 3.4 Image helper (single source of truth)
Create `getCharacterImage(themeSlug, characterSlug, variant)` and `getThemeCover(themeSlug)` reading `data/image-manifest.json` (key format `"naruto/itachi"`, `"naruto/_cover"`). Return `{ src, width, height }`. For Astral Kin, fall back to its existing image paths. If nothing is found, return the neutral placeholder: a rounded square in the theme accent with the character's initial (NOT a character drawing) and log a dev-only warning.
Then search the whole codebase for the old robot placeholder (see `reference/ui/05-old-placeholder-robot-TO-REMOVE.png`: any inline SVG robot, `robot`, `kin-placeholder`, etc.) and route every character image through the helper. The robot may remain ONLY as Astral Kin's own artwork if that is what Astral Kin uses.

**Phase 1 checks:** verify script passes; seed runs twice without duplicates; `grep` shows no hard-coded `/images/themes/` paths outside the helper and seed.

---

## 4. PHASE 2 — DESIGN SYSTEM + HOMEPAGE

### 4.1 Problem
The current dark homepage looks AI-generated: identical rounded cards everywhere, everything centred or evenly gridded, purple used as filler, a generic gradient progress bar, no rhythm or hierarchy. Fix it so it looks like a real design team made it.

### 4.2 Tokens (define once, use site-wide)
In the existing styling system create tokens for:
- Colour: `--bg #14112A`, `--surface #1C1838`, `--surface-2 #252048`, `--border rgba(255,255,255,.08)`, `--text #F2F0FF`, `--text-muted #A9A3CF`, `--primary #FFD84D` (actions + key numbers ONLY), `--live #5EEAD4` (live states ONLY), rarity: `--common #E5E7EB`, `--rare` = theme accent, `--secret #F5C542`.
- Type scale ONLY these sizes: 13 / 16 / 20 / 28 / 44 / 72 px (mobile H1 44). Body 16–18px, line-height 1.55, max 65ch.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 72, 120, 160.
- Radius: exactly two values, 10px and 20px. Pill only for the primary CTA.
- Motion: 150ms (hover), 300ms (UI), 600ms (reveal). Everything off under `prefers-reduced-motion`.
- One icon set, one stroke width. No emoji icons.

### 4.3 Homepage content (take from `reference/ui/01-old-light-homepage-CONTENT-source.png`)
1. Eyebrow: "Collect more consciously"
2. H1: "Collect the surprise. Produce only what's wanted."
3. Sub-copy: Play a short quest, unlock a preorder slot, open a digital blind box and trade what you don't want. Only confirmed orders get made. Real collectibles, less waste.
4. Primary CTA "Explore the drops" → `/drops`. Secondary text link "How the draw stays fair" (existing link).
5. Live drop status for the featured live theme (Astral Kin): claimed/total from real data.
6. Checkout banner (Section 7.1) when relevant.
7. Three value props: Brand partnerships / Made in-house (3D printed) / No overstock risk.
8. "How LoopBox works" — 6 steps: **Play → Unlock → Open → Trade → Confirm & pay → We produce** (payment is now step 5).
9. "Now dropping" strip: the 3 live themes using `cover.webp`, linking to their drop pages (with concept badges where needed).
10. Ecosystem strip: Brand/theme partner → Collectors → In-house production, with "Same passion. Less waste."
11. Footer: logo, "Limited collectibles, made to confirmed demand.", nav links, socials, "Hackathon demo — no real payments except the Astral Kin test drop", Terms (draft).

### 4.4 Layout rules (these make it look human)
- 12-column grid, max width 1200px. **Asymmetric hero**: text spans 7 columns left; visual spans 5 columns right and bleeds ~40px past the grid edge.
- Hero visual: the featured drop's image on a soft radial glow + subtle noise texture overlay (tiny inline data-URI PNG or CSS). A small rotated (−6°) sticker "93 of 100 claimed" using live numbers.
- Under "only what's wanted", an SVG underline with a slightly irregular hand-drawn path that draws in on load (static under reduced motion).
- Live counter: **segmented bar** (20 blocks, each = 5% of cap), claimed blocks solid `--primary`, numbers in tabular figures. Label like "7 left · closes in 6d 14h".
- Value props: one horizontal band with thin vertical dividers. No card backgrounds.
- How it works: **horizontal timeline** with a connecting line and numbered nodes; vertical on mobile. If logged in, highlight the user's current step.
- Now dropping: 3 cover images in an uneven layout (one large 2/3 width, two stacked 1/3).
- Vary section spacing (120 / 72 / 160). No two adjacent sections use the same layout pattern.
- Sections fade/slide 16px on first scroll into view (IntersectionObserver), disabled under reduced motion.
- Responsive at 1440, 1024, 768, 390. No horizontal scroll anywhere.

**Phase 2 checks:** screenshots at 1440 and 390 saved to `docs/screens/home-*.png`; every item in 4.3 present; tokens used (no stray hex colours in homepage components).

---

## 5. PHASE 3a — DROPS THEME BROWSER (`/drops`)

Layout reference: `reference/ui/04-theme-grid-LAYOUT-reference.png` (tab switcher above a 2-column grid of project cards with image, status tag, title, description, tag chips).

- Rename nav "The drop" → **"Drops"** → `/drops`. Nav order: Drops · My collection · Trade room · Marketplace · For partners · **Checkout (badge)** · account menu.
- Header: H1 "Drops", subtitle "Limited runs. Made only after you confirm."
- Segmented tabs: `All` · `Live now` · `Coming soon` (URL query `?tab=` so it's shareable).
- Grid: 2 columns ≥ 900px, 1 column below. Cards sorted by `sort_order`.
- **Theme card:**
  - 16:10 image area: `cover.webp` for live themes; abstract art for coming soon.
  - Top-left tag: `LIVE` (mint) or `COMING SOON` (muted outline). Top-right: `● 7 left` or `Notify me`.
  - Concept badge on licensed themes.
  - Title (uppercase display), 2-line description (line-clamp).
  - Chips: price, number of characters, rarity mix (e.g. `2 common · 1 rare · 1 secret`), closes in.
  - Whole card is one `<a>`: hover lift 2px + border brighten; visible focus ring.
- Live → `/drops/:slug` (drop page). Coming soon → `/drops/:slug` renders **To be continued**:
  - Abstract art full-width (blurred + darkened), theme name, big "To be continued…", line "This drop is still being designed with our partner.", **Notify me** button → inserts into new table `theme_interest (id, user_id, theme_id, created_at, unique(user_id, theme_id))`, then shows "You're on the list" state. Logged-out → login then return. Back link "← All drops".
- **Abstract art for coming-soon themes:** CSS mesh gradient built from the theme `accent` + `--bg`, SVG noise overlay, the theme name set huge in outline type at 8% opacity. No characters.

## 6. PHASE 3b — DROP DETAIL PAGE (`/drops/:slug`)

Template: `reference/ui/03-current-drop-page-TEMPLATE.png` (the current Astral Kin page). Make it data-driven for every live theme.
- Left column: `● N remaining`, theme name (display, huge), concept badge (if licensed), description, heading "The lineup. One box holds one figure, and you can't pick which.", then the character grid using `card` images: name, rarity pill, odds %. **Secret characters**: show the card image with a heavy blur + dark overlay + "Secret · 5%" until at least one has been pulled in this drop; then show normally.
- Clicking a character opens a detail lightbox: `hero` image (tab to view `poster`), name, rarity, odds, lore line, concept badge + "Concept render" caption.
- Right column (sticky ≥ 1024px): status pill "Preorder open", price (S$19.90 format from `price_cents`), "One sealed blind box, made after the preorder closes.", 2×2 stats (Left, Per person, Slot hold, Closes), primary **Play to unlock**, fine print "Free to play. No purchase needed to try the game. Odds are shown on every character."
- Theme accent: used only for rarity "rare" colour, the "remaining" dot and a faint top glow. Everything else stays on brand tokens.
- Mini-game: reuse the existing game component; pass the theme name and accent for skinning. Do not build new games.

**Phase 3 checks:** `/drops` shows 7 cards (3 live, 4 coming soon) in this order: Astral Kin, Naruto, Cyberpunk: Edgerunners, Jujutsu Kaisen, Genshin Impact, Sanrio Friends, Spy × Family. Naruto drop page shows exactly Naruto Uzumaki (common 40%), Sakura Haruno (common 40%), Sasuke Uchiha (rare 15%), Itachi Uchiha (secret 5%). Edgerunners shows exactly Rebecca (common 70%), David Martinez (rare 25%), Lucy (secret 5%). No Pokémon anywhere.

---

## 7. PHASE 4 — CHECKOUT (PAYMENT MOVES HERE)

### 7.1 Entry points
- Nav "Checkout" with a badge = number of the user's items in state `opened`.
- Homepage: if the logged-in user has ≥1 `opened` item, show a compact banner under the hero CTAs: "You have 2 figures waiting for confirmation · Review & checkout →". Otherwise show nothing.
- Reveal screen: primary **"Keep it — go to checkout"**, secondary **"Trade it"** (existing trade flow).

### 7.2 State machine
`slot_won → opened → confirmed → in_production → shipped`, with side exits `declined` and `expired`.
- Add columns/tables as needed (e.g. `order_items (id, user_id, theme_id, character_id, state, slot_won_at, opened_at, reserved_until, confirmed_at, payment_mode, payment_ref)`). Reuse existing order tables if they exist.
- Opening draws the character server-side (existing fair draw) and sets `reserved_until = opened_at + reservation_minutes`.
- Payment only on Checkout.

### 7.3 Anti-abuse rule (required, write tests)
Users now see their pull before paying, so they could decline commons and farm rares. Therefore:
- A slot can be opened **once**. **Decline** → character returns to stock (`stock_left + 1`), slot is consumed, **no re-roll**.
- Past `reserved_until` → `expired`, same return-to-stock, slot consumed. Run expiry lazily on every relevant request (and optionally a small interval job).
- `per_person_max` counts slots won, not only paid items.
- Show plainly on Checkout: "Declining returns this figure to the pool. Your slot won't give you a new draw."
- Tests: decline cannot trigger a new draw for the same slot; expired items return stock exactly once; per-person max blocks a 3rd slot even if earlier ones were declined.

### 7.4 `/checkout` layout
- H1 "Checkout", subtitle "Confirm the figures you want made. Nothing is produced until you confirm."
- Items grouped by theme: `card` image, name, rarity pill, theme, concept badge if licensed, price, **live countdown** to `reserved_until`, a select checkbox, and a **Decline** text button.
- Summary panel (sticky on desktop): selected count, subtotal, flat demo shipping S$3.50, total, note "Each figure is 3D-printed after the preorder closes. Estimated to ship 3–4 weeks after close.", and primary **Checkout** (disabled when nothing selected). If the selection mixes Stripe and demo items, show two labelled sub-totals: "Real payment (Astral Kin)" and "Demo payment (concept drops)".
- Empty state: short message + "Explore the drops" button.

### 7.5 "Are you sure?" modal
Pressing Checkout opens an accessible modal (focus trap, Esc closes, focus returns to the button):
- Heading **"Are you sure you want these made?"**
- Each selected figure's `thumb` + name, in a row.
- Body: "Once you confirm, we start production just for you. Made-to-order figures can't be cancelled or returned for change of mind."
- Required checkbox: "I understand these figures will be made just for me."
- Buttons **"Yes, confirm & pay"** (disabled until ticked) and **"Go back"**.
- Decline confirmation (smaller modal): "Return {name} to the pool? You won't get a new draw for this slot." → **Return it** / **Keep it**.

### 7.6 Payment
- **Stripe items (Astral Kin):** redirect to the existing Stripe Payment Link for that product, passing `client_reference_id` = order item id (or the repo's existing mechanism). Success URL `/checkout/success?order=…`. If the repo already verifies payment (webhook/session lookup), use it; if not, mark `confirmed` on return and note the limitation in `REDESIGN_NOTES.md`.
- **Demo items:** show a demo payment sheet: title "Demo payment", text "This is a concept drop. No money is charged.", button **Complete demo payment** → mark `confirmed`, `payment_mode = demo`.
- Mixed basket: complete demo items first in-page, then redirect for Stripe items.
- `/checkout/success`: "Confirmed. You're on the production list.", figures with `card` images, order number, a 4-step timeline (Confirmed → Printing → Quality check → Shipped) with the first step active, link to My collection.

---

## 8. PHASE 5 — OPENING ANIMATION

References: `reference/animation/video1-box-open-reference.mp4` (+ `video1-frames.png`), `reference/animation/video2-swipe-slice-reference.mp4` (+ `video2-frames.png`), `reference/animation/06-foil-pack-SHAPE-reference-do-not-copy-branding.png` (pack SHAPE only; do not copy any brand, logo, player or text from it).

Build one component `OpeningSequence` with props `{ theme, character, onComplete, onTrade }`. The draw result comes from the server **before** the animation starts. The animation is presentation only. Use CSS 3D transforms for the box/pack and ONE `<canvas>` overlay for particles and the blade trail. Animate only `transform`/`opacity`. Target 60fps on a mid-range phone. Preload the character `card` and `hero` images before Stage 1 starts.

**Stage 1 — Mystery box (video 1)**
- Full-screen overlay. Background: `--bg` with a slowly rotating sunburst of soft light rays tinted with the theme accent (conic-gradient, 20s rotation).
- 3D cube (6 faces) with the LoopBox cube logo on the front, theme accent on the edges. Idle: gentle float + a small wobble every ~2s.
- Bottom text: "Tap to open".
- On tap / click / Enter / Space: squash (scaleY .9) → stretch → 3 shakes of increasing strength (~600ms) → **lid flips off** (rotateX −110° + translateY −120px, fade) → light burst from inside → particles.

**Stage 2 — Foil pack**
- A sealed foil pack rises from the box and settles centre, tilted ~4°.
- Design: LoopBox-branded only. Serrated/crimped top and bottom edges (CSS mask or SVG), theme name, "1 figure inside", holographic sheen (moving linear-gradient following pointer or `deviceorientation`).
- Instruction with an animated hand/arrow hint: "Swipe across the pack to tear it open".

**Stage 3 — Swipe to slice (video 2)**
- Pointer events on the stage (`touch-action: none`). Record the stroke path.
- Blade trail on canvas: tapered stroke, white core fading to theme accent, fades out in ~200ms.
- Valid slice = one continuous stroke that enters and exits the pack bounds and covers ≥ 60% of pack width (any angle). Invalid → pack wobbles + hint "Swipe all the way across".
- Valid → 80ms hit-stop, then split the pack along the actual stroke line into two halves (two copies with `clip-path: polygon()` computed from the line), which fly apart with rotation and drop off-screen. Burst of foil confetti in theme colours. `navigator.vibrate?.(30)`.
- After 5s without a valid slice, show a button "Tap here to tear instead".

**Stage 4 — Reveal**
- Character image (`card` on mobile, `hero` on desktop) rises into place inside a glow ring: common = soft white; rare = theme accent; **secret** = gold `--secret` + extra rays + brief full-screen flash + 1.5× slower reveal.
- Rarity pill, name, theme, concept badge if licensed, "1 of {unit_cap} made in this drop".
- Buttons: **Keep it — go to checkout** / **Trade it**.

**Requirements:** "Skip" link top-right jumps to Stage 4. `prefers-reduced-motion` → simple fades, "Tear open" button instead of swipe. Result announced with `aria-live="polite"`. Sound optional, muted by default, toggle top-left. Replace the old opening UI everywhere it was used.

---

## 9. PHASE 6 — MY COLLECTION: ADD MORE BY QR

Purpose: owners of physical LoopBox figures (any theme) add them to their digital collection to show off.

### 9.1 Data
- New table `physical_items (id, code_hash unique, theme_id, character_id, serial_no, claimed_by null, claimed_at null, created_at)`.
- Each figure has a unique QR encoding `https://<site-origin>/claim/<code>`, `<code>` = 128-bit random token, base32, no padding. Store only SHA-256 of the code. Claimable **once**. Rate-limit claim attempts per user/IP (e.g. 10/min).
- Seed script `scripts/seed-physical.(js|py)`: 20 codes per live theme, spread across its characters, `serial_no` sequential per character. Print the codes to the console once (the raw codes cannot be recovered later) AND render them at an admin-only route **`/admin/qr-sheet`** as a printable A4 grid (QR image + character name + serial `#014 / 100`). Admin = existing admin flag, or an env var allow-list of emails if none exists. Generate QR images with a small maintained library that fits the stack.

### 9.2 UI
- My collection header gets an **Add more** button (top-right).
- It opens a scanner sheet: camera preview via a maintained browser QR library (`html5-qrcode`, or `jsQR` + `getUserMedia`), a framing square, text "Point your camera at the QR code on your figure's base or box."
- Fallbacks in the same sheet: **Upload a photo of the QR** and **Enter code manually**.
- Handle and show clear messages for: camera permission denied (how to allow + fallbacks), no camera, invalid code, already claimed by you, already claimed by someone else, logged out (login → return → finish claim).
- Success: reuse Stage 4 of `OpeningSequence` (reveal only, no box/pack), then the figure appears in the collection.
- Scanned items get a **Verified physical** badge + serial (`#014 / 100`). Collection filter tabs: All · Digital pulls · Physical.
- Visiting `/claim/<code>` directly (phone camera app) runs the same flow.
- Camera needs HTTPS (Railway/Render provide it; localhost is allowed). Note it in `REDESIGN_NOTES.md`.

---

## 10. PHASE 7 — MARKETPLACE STOREFRONT

Current state: `reference/ui/07-current-marketplace-TO-REDESIGN.png`. Think as a buyer: "Would I trust this and spend S$12 here?"

### 10.1 Remove
The eyebrow "Creator marketplace", the headline "Blind boxes, made by collectors.", its paragraph, and the big "Sell your series" pill.

### 10.2 Replace with
- Compact header: H1 **"Marketplace"**, one line "Independent blind-box series from verified sellers." Right side: text link "Sell on LoopBox →".
- **Trust strip** (3 items, icon + short text): "Payment held until you confirm delivery" · "Full stock shown before you buy" · "Verified sellers with trust scores".
- Toolbar: search, Theme, Rarity, price from/to, **Sort** (Newest, Price low–high, Price high–low, Most stock left, Top-rated sellers), results count ("24 series"). Filters sync to the URL query.

### 10.3 Listing card
- Lineup image area.
- Series name (bold) + theme tag.
- **Price per box** = largest text on the card.
- Stock bar + "10 of 40 left".
- Seller row: avatar initial, name, trust score badge, Verified check.
- Odds preview ("3 characters · 1 rare"), "Ships within X days".
- Whole card clickable to the series page. Purchase logic unchanged.

### 10.4 Series page (light touch)
Make sure it shows: per-character stock breakdown, odds, seller info, buyer protection text, shipping time, dispute/returns line. Reuse existing data; don't change purchase logic.

---

## 11. PHASE 8 — QA CHECKLIST (all must pass)

- [ ] `node loopbox-v2-kit/scripts/verify-assets.mjs public` → 0 problems.
- [ ] No Pokémon code, data, route or text anywhere (`grep -ri pokemon` returns only this prompt/kit files, if any).
- [ ] Homepage has all 4.3 content and follows 4.4 rules.
- [ ] `/drops`: 7 cards in the correct order, tabs work, badges correct.
- [ ] Naruto and Edgerunners lineups exactly as in Phase 3 checks, with the correct images in: theme card, lineup, lightbox, reveal, checkout, confirmation modal, collection tile, trade room.
- [ ] Concept badge + "Concept render" caption wherever licensed themes appear; licensed themes never hit Stripe.
- [ ] Full flow: play → win → open (animation) → checkout → modal → pay (Stripe or demo) → success → item in My collection.
- [ ] Anti-abuse tests pass (Section 7.3).
- [ ] Animation: 4 stages, valid/invalid swipe, tap fallback, skip, reduced-motion path, keyboard path.
- [ ] QR: camera scan, photo upload, manual entry, duplicate claim, invalid code, logged-out redirect, direct `/claim/<code>`, printable `/admin/qr-sheet`.
- [ ] Marketplace matches Section 10; old slogan gone.
- [ ] Lighthouse mobile accessibility ≥ 90 on Home, Drops, a drop page, Checkout. No console errors. No horizontal scroll at 390px. All controls keyboard reachable with visible focus.
- [ ] Nothing in the Section 0 scope lock changed.
- [ ] Screenshots of every new/changed page at 1440 and 390 in `docs/screens/`.

## 12. FINAL REPORT
Update `docs/REDESIGN_NOTES.md`: what changed per phase, new routes, new tables/columns, how to run both seed scripts and print the QR sheet, test commands, known limitations/TODOs, out-of-scope issues found.
