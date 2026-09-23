# LoopBox v2 kit — READ ME FIRST

This folder is everything Codex needs for the LoopBox v2 redesign. Nothing here should be guessed.

## How to use (human steps)
1. Unzip `loopbox-v2-kit.zip`.
2. Put the whole `loopbox-v2-kit/` folder in the **root of the repo** (next to package.json).
3. Open Codex in the repo and paste the full contents of `CODEX_MASTER_PROMPT.md` as the task.
4. If Codex runs out of room, run it phase by phase: tell it "Do Phase 1 only", then "Phase 2", etc.

## What's inside
| Path | What it is |
|---|---|
| `CODEX_MASTER_PROMPT.md` | The full build instructions for Codex. |
| `data/themes.seed.json` | Every theme, character, rarity, stock, price. Single source of truth. |
| `data/image-manifest.json` | Maps `theme/character` → every image file + size. |
| `public/images/themes/...` | Ready-made WebP images. Copy as-is into the repo's `public/`. |
| `scripts/verify-assets.mjs` | Checks every image exists. `node loopbox-v2-kit/scripts/verify-assets.mjs public` |
| `reference/ui/` | Screenshots: what to take content from, what theme to keep, layout references. |
| `reference/animation/` | The two reference videos + frame sheets + foil pack shape reference. |
| `reference/originals/` | Original full posters, for reference only. Do not ship from here. |

## Image variants (per character)
| Variant | Size | Use it for |
|---|---|---|
| `card` | 600×600 | Drop lineup cards, collection tiles, trade room, checkout rows, reveal |
| `thumb` | 200×200 | Small avatars, marketplace mini-previews, confirmation modal lists, badges |
| `hero` | 800×1200 | Homepage hero (featured theme), character detail view, reveal on large screens |
| `poster` | 1024×1536 | Only inside the character detail lightbox, with the concept badge visible |
| `cover.webp` (per theme) | 1600×1000 | The theme card on /drops |

## Character → file map
- Naruto theme: `naruto`, `sakura`, `sasuke`, `itachi`
- Cyberpunk: Edgerunners theme: `rebecca`, `david-martinez`, `lucy`
