# LoopBox design system v2 — "Night Counter"

Visual target: `design/reference.html` (open it in a browser). Frames 0–6 are the contract. When this file and the reference disagree, this file wins.

## Why the old design is being replaced
The v1 look (graphite-olive background, copper accent, 12–14 px grey text, empty gradient hero) reads as a quiet sustainability brand. Blind-box buyers want the thrill of the shelf: bright packaging, visible rarity, a loud opening. Judges will also see it on a projector, where 12 px grey on dark green disappears.

## Concept
The interface is the blind box. Surfaces behave like printed box panels. The live counter is a stamp on the box. Rarity is shown as foil finishes. Everything is calm except one moment: the reveal.

## Tokens (put these in `:root` in `src/app/globals.css`, replacing the old ones)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#17123A` | page background |
| `--orbit` | `#221B52` | raised surfaces, cards |
| `--orbit-2` | `#2E2668` | hover, selected nav |
| `--moon` | `#EEEBFB` | main text on dark; light "box panel" surfaces |
| `--moon-muted` | `#B7B0E0` | secondary text (never smaller than 15 px) |
| `--star` | `#FFD84D` | primary action only |
| `--star-ink` | `#2A1F00` | text on `--star` |
| `--nebula` | `#FF6FB5` | secret tier, urgency (last few units) |
| `--aurora` | `#62E3C8` | live, success, verified |
| `--danger` | `#FF8A7A` | errors |
| `--line` | `rgba(238,235,251,.16)` | borders |
| `--foil-common` / `--foil-rare` / `--foil-secret` | see reference | rarity badges and reveal burst |
| `--r-sm/md/lg/pill` | 10 / 18 / 28 / 999 px | small chips / cards / panels / buttons |
| spacing | 4, 8, 12, 16, 24, 32, 48, 72, 112 px | nothing else |

Legacy variable names used by existing CSS (`--bg`, `--surface`, `--text`, `--muted`, `--accent`) must be re-pointed to the new tokens in M1 so nothing breaks, then removed screen by screen.

## Type
- Display: **Unbounded** (`@fontsource-variable/unbounded`), weights 600/800. Headings only.
- Body/UI: **Figtree** (`@fontsource-variable/figtree`), 500 body, 700 buttons.
- Scale: h1 clamp(40px, 5.6vw, 76px) · h2 clamp(28px, 3.6vw, 46px) · h3 20px · body 17px · small 15px · minimum anywhere 13px.
- Body line length ≤ 60ch. Sentence case everywhere.

## Components (build in `src/components/ui/`)
- `Button` variants: `primary` (star yellow, 5 px solid bottom shadow that compresses on press), `ghost` (2 px outline), `quiet` (underlined text). Min height 52 px (44 px for quiet). Exactly one `primary` per screen region.
- `Tier` badge: common/rare/secret foil. Rare foil has a slow sheen; disabled under reduced motion.
- `Stat`: label (13 px, muted) over value (Unbounded 20 px).
- `Card`: `--orbit`, radius md, no drop shadow. Box-panel variant: `--moon` background with dark text (used for the price ticket and the purchase panel).
- `Perforation`: dashed 3 px rule used only where something is torn/opened (price ticket, reveal).
- `Empty` and `ErrorNote`: title, one sentence, one action.
- `Skeleton`: `--orbit-2` blocks; no spinners except inside the game.
- Mobile nav: bottom tab bar ≤ 900 px (Drop, Collection, Trades, Market, Me). The existing "Open menu" button must still exist and work (e2e).

## Screen rules
- Home: the box illustration or the existing 3D stage is the hero, with a yellow "93 of 100 claimed" stamp. One primary CTA ("Explore the drop"). The 5-step "How a drop works" is the only numbered list.
- Drop: character lineup with tier badge and "N of 100 boxes" under every character. Secret character is shown as a dark silhouette named "Secret kin". The buy panel is a light box-panel card, sticky on desktop.
- Quest: full-bleed dark stage; score and countdown in Unbounded; the pause button stays reachable by keyboard.
- Checkout: price ticket card, age checkbox, one primary "Pay with card" (M5). In DEMO simulated mode, a visible note "Simulated payment (demo)".
- Reveal: the only loud moment. Sequence ≤ 2.4 s: box shakes (0.4 s) → splits (0.5 s) → foil burst in tier colour (0.6 s) → character rises → name lands last. Reduced motion: skip to final frame. Revisiting shows the final frame immediately.
- Collection/Trades: cards on `--orbit`; the swap icon and "Accept exchange" are the only yellow elements on the trade screen.
- Verify: plain-language explanation first, hashes second, green `--aurora` confirmation bar.
- Studio/partner/admin: same tokens, denser, no foil, no motion. Tables scroll inside their own container.
- Market (C2C): listing cards show photo, title, price, seller trust score, "N left". Warnings (payment outside app) use `--danger` outline, never fill.

## Don'ts
- No ALL-CAPS eyebrow labels. No "A · B · C" meta strings (except the protected "Sold out · Join waitlist" button). No arrows appended to button text. No gradients as decoration outside foils and the progress bar. No new fonts. No Tailwind. No emoji in UI.
- No text below 13 px. No `--moon-muted` text below 15 px. Contrast AA minimum (axe checks already run in e2e).
- No motion on page load except the home stamp settling once.

## 3D and art
Keep `scene.tsx`, `stage.tsx`, `art.tsx` geometry. Only recolour: character colours come from `src/lib/catalog.ts` (new values below); background/glass colours use `--ink`/`--orbit`.

| id | new colour |
|---|---|
| nova | `#FFB36B` |
| moss | `#8FE08A` |
| tide | `#6FC8FF` |
| ember | `#FF7F66` |
| eclipse | `#FFD84D` |
| aurora | `#62E3C8` |
| void | `#C8A8FF` |
