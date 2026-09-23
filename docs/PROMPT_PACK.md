# LoopBox — Build Prompt Pack v2 (redesign + finish)
Repo inspected: `gohziqian1234-cmyk/hackaton-open-hack-` (uploaded zip, 53 files). Target agents: Claude Code and Codex.

Files in this pack:
- `AGENTS.md` — the persistent spec (section 4A). Replace the repo's AGENTS.md with it. Keep `CLAUDE.md` as the single line `@AGENTS.md`.
- `DESIGN.md` — design rules. Put at repo root.
- `design/reference.html` — the visual template. Put at `design/reference.html`.
- `PROJECT_STATE.md` — starting state. Put at repo root.
- This file — verdict, analysis, kickoff, milestone prompts, demo pack.

---

## 1. CURRENT VERDICT

The repo is better engineered than most hackathon entries (server-side entitlements, SQLite capacity trigger, one-use game sessions, e2e tests with axe), but it is a **single-campaign demo with fake payment, weighted-random allocation you cannot verify, and zero B2B or C2C**. The design is tasteful and wrong: olive-graphite, copper, 12–14 px grey text, and a hero whose main image is an empty gradient with a spinner. It sells a sustainable furniture brand, not the thrill of a blind box, and it will be unreadable on a projector. Your own master prompt also contradicts your repo: it says Supabase + Vercel, the code is SQLite on one server, and following it literally burns Day 1 on a migration nobody on your team can debug. The winning move is: keep the engine, redesign the skin, add Stripe test Checkout and a real fairness proof, then bolt on thin B2B and C2C. As a startup, the B2C game gate is a marketing gimmick; the real business is demand-first manufacturing for creator collectives.

---

## 2. PROJECT STATE

**GOAL:** Win NYP Open Hack with a live, redesigned golden path (play → pay with Stripe test card → reveal → swap → verify fairness), plus thin but real B2B and C2C, in 48 h, built entirely by prompting.

**Placeholders you did not fill** (so these are ASSUMPTIONS): challenge statement, rubric, submission requirements, team size/roles, extra notes, and the Grandmaster doctrine text itself. I applied the doctrine as summarised in your prompt.

### Rubric matrix (ASSUMED typical criteria and weights — replace when you have the real rubric)

| Criterion | Weight (ASSUMED) | What judges expect | Our evidence | Weakness | Action |
|---|---|---|---|---|---|
| Problem / impact | 20% | Real pain, specific user | Overproduction + unfair drops + scalpers | "Why play a hard game to pay full price?" is unanswered | Pitch: game = anti-bot fair access, not a toll; show win-rate control |
| Innovation | 20% | Something they haven't seen | Pre-manufacture swap + committed shuffle | Pop Mart already does blind boxes | Lead with verify page: "check we didn't rig it" |
| Technical execution | 25% | Works live, not mocked | Existing engine + tests | Payment is fake, allocation unverifiable | M4 fairness, M5 Stripe, concurrency test shown on screen |
| Demo / UX | 20% | Clear, delightful, fast | 3D reveal exists | Muted, tiny text, no thrill | M1–M3 redesign, loud reveal |
| Business viability | 15% | Revenue, market | Three models | Three models = unfocused | Pitch one wedge (B2B collectives), show fee math |

### 48-hour schedule (H0 = when you paste the kickoff)

| Hours | Build (coding driver) | Others |
|---|---|---|
| H0–1.5 | M0 baseline + safety net | Fill rubric; set up Stripe test keys + CLI; pick host |
| H1.5–4.5 | M1 design system + shell | Write pitch problem slide; collect 3 SG seller personas |
| H4.5–9.5 | M2 collector screens | Manual-test each report's steps |
| H9.5–11.5 | M3 studio + states + mobile | Record **backup video #1** |
| H11.5–15.5 | M4 fairness pool + /verify | Draft README business section |
| H15.5–21 | **Sleep (driver)** | Second person sleeps H21–26 |
| H21–25 | M5 Stripe Checkout + webhook | Test with card 4242… per report steps |
| H25–27 | M6 admin close + manifest → **P0 COMPLETE** | Record **backup video #2**; screenshots |
| H27–30 | M7 B2B | Pitch deck draft |
| H30–35 | M8 C2C | Rehearse demo script ×2 |
| H35–37 | M9 hardening | — |
| H37–42 | Buffer / cut plan / 3 h sleep | Final README, submission form |
| **H42–48** | **FEATURE FREEZE** — bug fixes only if a demo step fails | Rehearse pitch ×3, final video, submit by H46 |

**TEAM CAPACITY (ASSUMED 3 people):** Driver (runs Claude Code, only person who commits), Reviewer (runs Codex in *read-only review mode* on each milestone diff — see 4B), Tester/Pitcher (does every "HOW TO CHECK IT YOURSELF" step, owns deck + video). Two agents writing the same repo at once will create merge conflicts nobody on your team can resolve — do not do it.

**DECIDED (FACT):** three models; verified sellers; stock-weighted C2C draw; seller fulfils; transaction fee; hard game; Stripe; SGD; 2 days; no coders; both agents.
**ASSUMED:** rubric weights above; team of 3; pool counts 21/21/21/21/7/7/2; C2C fee 8% min S$0.50; revenue share 30%; single-host deploy.
**RISKS (top 5):** SQLite host choice; Stripe webhook not reachable during demo; redesign breaks e2e accessible names; C2C scope overruns; agent claims green without running e2e.

---

## 3. Blocking questions

None, proceeding on defaults. One thing to decide yourselves in the first hour, not blocking the build: which single-host provider you deploy to (M0 prompts the agent to support any Node 24 host with a disk; localhost is the backup).

---

## 4. Decisions on the 1.7 contradictions

| # | Default | Decision | Why |
|---|---|---|---|
| 1 | In-app Stripe; private payment optional with warning | **OVERRIDE: private payment removed entirely** | It kills the fee, is the #1 Carousell scam vector, and adds states you can't test in 48 h. Chat shows "Pay only through LoopBox". |
| 2 | Immutable draw log + confirm/report + trust score | **KEEP** | Only honest option without physical verification. |
| 3 | Checkout Session per order + idempotent webhook; payment links fallback | **KEEP, minus payment links** | Payment Links can't bind to a reservation. Fallback is a DEMO_MODE simulated webhook instead. |
| 4 | Difficulty config, attempt limit, DEMO auto-win | **KEEP** | Required_score + attempts_per_day per campaign; dashboard shows live win rate. |
| 5 | Free-to-play, odds disclosed, age gate, LEGAL REVIEW list | **KEEP** | Plus: never write compliance claims. |
| 6 | B2C P0, B2B/C2C P1 thin | **KEEP + add redesign to P0** | Demo/UX is a scored criterion and the current skin loses it. |
| 7 | Wishlist, 2-way match, seeded match | **KEEP** | Existing code already does this. |
| NEW | Supabase + Vercel stack | **OVERRIDE: keep SQLite on one Node host** | Migration is the highest-risk task for a team that cannot debug. Postgres = FUTURE. |
| NEW | RLS | **OVERRIDE: service-layer authz + IDOR tests** | SQLite has no RLS; tests are the enforcement proof. |
| NEW | CAPTCHA before play | **OVERRIDE → P2** | Needs third-party keys + network; rate limit + attempt limit instead. |
| NEW | Deterministic demo allocation (Eclipse Knight) vs "not rigged" claim | **RESOLVE: fixed committed seed, disclosed** | The shuffle is committed before the demo; the verify page says the demo seed was chosen for repeatability. Hiding this would be exactly the rigging accusation you're defending against. |

---

## 5. Red team + investor review

| Attack | Why it matters | Sev | Prob | Mitigation | Residual |
|---|---|---|---|---|---|
| "Why play a hard game to pay full price?" | Core value prop | High | High | Frame game as fair-access gate vs bots/scalpers; free to play; tunable win rate | Medium — needs user evidence you don't have |
| Pop Mart / Shopee / Carousell already exist | Innovation score | High | High | Differentiator = made-to-order + pre-manufacture swap + verifiable draw | Medium |
| "You rigged the draw" | Trust, demo credibility | High | Med | Commit-reveal shuffle, /verify page, disclosed demo seed | Low |
| Bots / multi-accounts farm wins | Scalpers return | High | High | Attempt limit, rate limit, 2 per person; CAPTCHA/phone = FUTURE | High in production, low for demo |
| Oversell under load | Refunds, trust | High | Med | Trigger + BEGIN IMMEDIATE + concurrency test | Low |
| Webhook fails live | Demo dies | High | Med | Simulated webhook in DEMO_MODE; success page polls; backups B–E | Low |
| C2C fake stock | Buyer fraud | High | High | Immutable draw log, report flow, trust score, suspension | Medium |
| C2C non-delivery / private-pay scam | Fraud | High | Med | In-app only, held funds, 7-day window | Medium |
| Partner submits counterfeit IP | Legal | High | Med | IP statement at apply, admin review, LEGAL REVIEW list | Medium |
| Gambling / lottery classification | Existential in SG | High | Unknown | Free play, odds shown, age gate, legal review; no claims | **Unknown — get advice before launch** |
| Rare-tier trade liquidity | Swap feature feels dead | Med | High | Seeded match; P2 multi-way cycles | Medium |
| Redesign breaks tests | Lost hours | Med | High | Protected-strings list in spec; e2e each milestone | Low |
| Agent says "done" but didn't run anything | Silent breakage | High | High | Mandatory VERIFIED command list; Codex reviewer; tester runs manual steps | Low |
| SQLite on serverless loses data | Live demo empty | High | Med | Single-host deploy with disk; localhost backup | Low |
| Unit economics unknown | Investor score | Med | High | Show formula with labelled projections only | Medium |

### Kill test (PROPOSAL — your doctrine's 10 questions weren't pasted, so these are my 10)
1. Can a judge complete the golden path unassisted in 90 s? **Only after M2+M5.** 2. Does anything in the demo depend on the network that could fail? **Stripe — mitigated by simulate.** 3. Is the "wow" visible without explanation? **Reveal yes; verify needs one sentence.** 4. Is there one claim a judge can falsify? **"Not rigged" — which is why /verify exists.** 5. Is any number in the pitch invented? **Must be none; label projections.** 6. Can we explain the business in one sentence? **Yes if you pitch one wedge.** 7. Is P0 protected if C2C runs over? **Yes, cut plan.** 8. Would the demo survive a refresh mid-flow? **Existing persistence says yes; test it.** 9. Does a real user exist? **No evidence. Get 3 quotes from SG collectors before pitch.** 10. Is anything claimed as done that is simulated? **Label simulated payment, OTP, payouts on screen.**

### Investor verdict
1. The real business is **demand-first production for small IP owners**: they sell a series before manufacturing, and you take the preorder, the draw, the trade market and the manifest.
2. Strongest wedge: **Creator Collectives via B2B** — they have the inventory-risk pain and no tooling; brands already have Pop Mart-style channels.
3. The game gate is a campaign feature for hype drops, not the company.
4. C2C is a Carousell clone with the worst fraud profile of the three; keep it only as a creator-acquisition funnel, cut long term if it doesn't feed B2B.
5. Before any real launch, Singapore legal advice on chance-based paid boxes is a gating item, not a footnote.

---

## 6. Scope

| P | Items |
|---|---|
| **P0** | Redesign (tokens, shell, all collector screens, reveal, mobile); seeded campaign; game + attempt limit + DEMO win; reservation TTL; Stripe test Checkout + verified idempotent webhook + simulate fallback; committed-pool allocation; reveal; keep; trade pool + wishlist; 2-way swap; admin close; manifest CSV; /verify page; concurrency + webhook tests |
| **P1** | Partner apply/approve/editor/dashboard; C2C verify (simulated OTP), listing, browse/filter, checkout with fee, stock-weighted draw, reveal, seller pick list, fulfil, confirm/report, basic chat, trust score display |
| **P2** | Multi-way swap cycles, realtime, QR certificates, second game template, CAPTCHA, reputation weighting beyond formula |
| **P3 (CUT)** | Native app, AI chatbot, NFTs, social feed, Stripe Connect payouts, private payments, Supabase migration |

**The ONE wow moment (protect it):** judge plays, wins, pays with test card 4242 4242 4242 4242, watches the box split and the rare foil burst, taps "Find a trade", gets an instant same-rarity swap, then opens /verify and sees the green "Fingerprints match" bar.

---

## 7. Architecture

| Layer | Choice | Why |
|---|---|---|
| UI | Next.js 16 App Router + React 19 + plain CSS tokens | Already in repo; no Tailwind rewrite |
| API | `/api/loopbox` action endpoint + `/api/stripe/*` + small GET routes | Existing pattern, Zod-validated |
| Domain | `src/domain/*` pure functions | Testable, agent can't hide logic in UI |
| DB | SQLite (`node:sqlite`), WAL, `BEGIN IMMEDIATE` | Working, transactional, zero setup |
| Auth | Existing random session cookies + demo identities + simulated OTP | Real auth = FUTURE |
| Payments | Stripe Checkout Sessions (test) + webhook + DEMO simulate | Binds payment to a reservation |
| Files | Local disk `data/uploads`, sniffed | No extra service |
| Jobs | Admin "sweep" button + lazy expiry on read | No cron infra needed |
| Hosting | One Node 24 server with persistent disk; localhost backup | SQLite constraint |

```
 Browser (mobile-first UI, no business rules)
    │  fetch JSON (same-origin POST, Zod)
    ▼
 Next.js route handlers ──► src/server/service.ts ──► src/domain/* (pure)
    │                             │
    │                             ▼
    │                      SQLite file (WAL) + triggers
    │                      data/loopbox.sqlite, data/uploads/
    ▼
 /api/stripe/checkout ──► Stripe (test) ──► Checkout page
                                   │
      /api/stripe/webhook ◄────────┘ (signed event) ─► webhook_events (dedupe) ─► allocate in txn
      /api/stripe/simulate (DEMO only) ─► same handler
```

| Component fails | Effect | Fallback |
|---|---|---|
| Stripe unreachable | Can't pay | DEMO simulate button |
| Webhook not delivered | Order stuck PENDING | Success page shows "Waiting for payment…" + admin sweep; simulate |
| WebGL off | No 3D | Existing SVG fallback |
| Host down | No live URL | Localhost backup B |
| DB corrupted | Empty app | Delete file → reseed (README steps) |
| Fonts CDN | n/a | Fonts are bundled via fontsource |

**Cost (ESTIMATES, verify pricing):** hackathon ≈ S$0–15 (free/low tier host, Stripe test mode is free). 10k users: one small VM with disk tens of dollars/month; Stripe standard card fees per transaction (check Stripe SG pricing page); at that scale you'd migrate to Postgres anyway.

---

## 8. BUILD PROMPT PACK

### 4A — Persistent spec
See `AGENTS.md` in this pack (verbatim, not summarised). `CLAUDE.md` = `@AGENTS.md`. Plus `DESIGN.md` and `design/reference.html`.

### 4B — Kickoff prompt (paste into Claude Code first)

```
You are the only coding agent on this repo. The humans cannot read or debug code.

1. Read AGENTS.md completely, then DESIGN.md, then open design/reference.html and describe in 5 bullet points what you see in Frames 0–6. Then read PROJECT_STATE.md.
2. Check installed versions: print next, react, zod, three, @react-three/fiber, vitest, @playwright/test from node_modules/*/package.json. Read node_modules/next/dist/docs/ index so you know where route-handler and App Router docs live.
3. Restate the whole plan in plain English for a non-programmer: 8–12 sentences covering what M0–M9 will do, in order.
4. List every ambiguity or contradiction you find between AGENTS.md, DESIGN.md, the reference and the existing code. For each, propose the default you will use. Do not ask me to choose unless it blocks M0.
5. Then execute milestone M0 ONLY (prompt below is in PROJECT_STATE.md NEXT; I will paste it next). Wait for my M0 prompt before writing any code.

Use the report format from AGENTS.md section 22.
```

### Reviewer prompt (paste into Codex after every milestone — Codex does NOT edit)

```
Read AGENTS.md and DESIGN.md. Do not modify any file.
Review the diff of the last commit (git show --stat HEAD, then git show HEAD).
Report, in plain English, a numbered list of:
1) any violation of AGENTS.md sections 5–21 (quote the rule number),
2) any business logic inside src/components or src/app pages,
3) any test that was deleted, skipped, loosened or had its expected value changed,
4) any secret, NEXT_PUBLIC_ secret, or PII in logs,
5) any TODO(STUB) not listed in the agent's report,
6) any protected string from AGENTS.md section 24 that changed.
Then run: npm run typecheck && npm run lint && npm test and paste the last 15 lines of each.
End with a verdict: PASS or FAIL with the single most important fix.
```

---

### 4C — Milestone prompts

Every milestone prompt ends with the same closing line. Paste one, wait for the report, run the manual checks, run the reviewer, then paste the next.

#### M0 — Baseline & safety net (~1.5 h)

```
MILESTONE M0 — Baseline and safety net.

OBJECTIVE: Prove the existing app is green, freeze a restore point, and install the new spec files. No features, no design changes.

SCOPE IN:
- Run npm ci, typecheck, lint, test, build, test:e2e (install Playwright chromium if needed: npx playwright install chromium). Record exact results.
- Create git tag baseline-v1 on the current commit BEFORE any change.
- Confirm AGENTS.md, DESIGN.md, design/reference.html, PROJECT_STATE.md exist at the paths in AGENTS.md section 4 (the human copied them in). CLAUDE.md must contain only: @AGENTS.md
- Add .env.example entries (empty values, with comments): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000, SIMULATE_PAYMENTS=true, ADMIN_DEMO=true.
- Add npm script "reset:demo" that deletes data/loopbox.sqlite, -wal, -shm (cross-platform using a small node script in scripts/reset-demo.mjs).
- Add a /health route (GET /api/health → {ok:true, db:true|false, demo:boolean}) that opens the DB and runs SELECT 1.
- Add a Dockerfile-free deploy note to README "Deploy (single host)" explaining: needs Node 24, persistent disk mounted at data/, env vars, start command `npm run build && npm start` with HOSTNAME=0.0.0.0. Change the start script to respect a HOSTNAME env var and default to 127.0.0.1. Do not deploy to Vercel.
- Take screenshots of /, /drop, /reveal (via e2e flow), /studio at 1360px and 390px into work/before/ (gitignored) for comparison later.

SCOPE OUT: any UI, CSS, schema, business logic change.

FILES EXPECTED: .env.example, package.json (scripts only), scripts/reset-demo.mjs, src/app/api/health/route.ts, README.md (deploy section), .gitignore, PROJECT_STATE.md.

ACCEPTANCE CRITERIA:
- git tag baseline-v1 exists and points to the pre-change commit.
- typecheck, lint, test, build, test:e2e all pass (or: if e2e failed BEFORE your changes, report BROKEN with the failing test name; do not fix app code in M0).
- GET /api/health returns {"ok":true,"db":true,"demo":true}.
- npm run reset:demo then npm run dev → home shows 93 / 100.

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e; curl -s http://127.0.0.1:3000/api/health

REGRESSION: all pre-existing tests unchanged (git diff baseline-v1 -- tests/ must be empty).

MANUAL STEPS FOR THE HUMAN (write these in your report with expected results): open the site, open /api/health, run reset:demo, reopen, confirm 93/100.

Report in AGENTS.md section 22 format. Update PROJECT_STATE.md. Commit "M0: baseline and safety net", tag m0-green.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M1 — Design system + shell (~3 h)

```
MILESTONE M1 — Design system and app shell.

OBJECTIVE: Replace the old visual foundation with the "Night Counter" system from DESIGN.md so every page instantly picks up the new colours, fonts and buttons, without breaking any test.

SCOPE IN:
1. Fonts: npm install @fontsource-variable/unbounded @fontsource-variable/figtree; npm uninstall @fontsource-variable/dm-sans @fontsource-variable/manrope. Update imports in src/app/layout.tsx. Check the package's documented import path in node_modules before importing.
2. globals.css: replace the :root token block with the DESIGN.md tokens. Re-point legacy variables so existing rules keep working: --bg:var(--ink); --surface:var(--orbit); --surface2:var(--orbit-2); --text:var(--moon); --muted:var(--moon-muted); --accent:var(--star); --accent-dark:var(--star-ink); --green:var(--aurora); --danger:#FF8A7A; --font:'Figtree Variable',system-ui,sans-serif; --display:'Unbounded Variable',system-ui,sans-serif. Verify the exact font-family names in each fontsource package's CSS.
3. Base typography: body 17px/1.55 weight 500; h1 clamp(40px,5.6vw,76px) 800; h2 clamp(28px,3.6vw,46px) 600; h3 20px 600. Set a global rule: nothing below 13px (search globals.css for font-size values under 13px and raise them; list every change in the report).
4. Remove `em{font-family:Georgia}` serif accent and every ALL-CAPS text-transform/letter-spaced eyebrow style. Where JSX has uppercase literal strings used as eyebrows (e.g. "SMALL BATCHES. BIG POSSIBILITIES."), convert to sentence case ONLY if the string is not in AGENTS.md section 24.
5. Create src/components/ui/: Button.tsx (variants primary|ghost|quiet, renders <button> or Next <Link> via `href` prop, forwards all aria props), Tier.tsx (common|rare|secret foil), Stat.tsx, Card.tsx (variants orbit|panel), Empty.tsx, ErrorNote.tsx, Skeleton.tsx, Perforation.tsx. Styles live in globals.css under a clearly commented "UI primitives" section with the class names used in design/reference.html (.btn, .btn-primary, .btn-ghost, .btn-quiet, .tier, .live).
6. Shell (src/components/shell.tsx): new logo mark (the yellow isometric box from reference Frame 1), pill navigation with aria-current, add nav links "Marketplace" (/market) and "For partners" (/partners) that render a simple "Coming in a later milestone" Empty state page for now (mark TODO(STUB)). Keep the "Open menu" button and the account switcher button whose name contains "Demo collector". Under 900px add a bottom tab bar (Drop, Collection, Trades, Market, Me) that respects env(safe-area-inset-bottom). Footer: sentence case, no middle-dot strings.
7. Loading component: replace spinner with Skeleton blocks.
8. Recolour characters in src/lib/catalog.ts to the DESIGN.md table. In art.tsx replace dark-green gradient stops (#303c36, #61746c, #1e302a, #101b18, #182820) with --ink/--orbit equivalents (#17123A, #2E2668, #221B52, #0E0A26).

SCOPE OUT: page layouts (M2), any server/domain code, any test file.

FILES EXPECTED: package.json, package-lock.json, src/app/layout.tsx, src/app/globals.css, src/components/shell.tsx, src/components/art.tsx, src/lib/catalog.ts, src/components/ui/*.tsx, src/app/market/page.tsx, src/app/partners/page.tsx.

ACCEPTANCE CRITERIA:
- No occurrence of 'DM Sans', 'Manrope', 'Georgia' in src/.
- grep for "font-size: *([0-9]|1[0-2])px" in globals.css returns nothing.
- All e2e tests pass unchanged, including axe checks.
- Screenshot of / at 1360px and 390px saved to work/after-m1/; header matches reference Frame 1 (logo, pill nav, account chip) and the page background is #17123A.
- No horizontal scroll at 390px (e2e already checks; keep it green).

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e; grep -rn "Manrope\|DM Sans\|Georgia" src || echo clean

REGRESSION: git diff m0-green -- tests/ must be empty.

MANUAL STEPS: tell the human exactly which pages to open at desktop width and on their phone (or browser devtools at 390px), and what colour/font/nav they should see on each.

Report in AGENTS.md section 22 format. Update PROJECT_STATE.md. Commit "M1: design system and shell", tag m1-green.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M2 — Collector screens redesign (~5 h)

```
MILESTONE M2 — Redesign the collector golden path screens.

OBJECTIVE: Make /, /drop, /quest, /checkout, /reveal/[id], /collection and /trades match design/reference.html Frames 1–4 and 6, keeping every behaviour and every protected string.

WORK ORDER (commit after each screen passes e2e, message "M2.<n>: <screen>"):
1. Home (src/components/discovery.tsx): Frame 1. Hero left = live badge, h1 "A little mystery, made to order." (must still match /A little mystery/), one paragraph, primary Button "Explore the drop" (exact name), quiet link "How the draw stays fair" → /verify/astral (page arrives in M4; until then the link may 404 — mark TODO(STUB)). Hero right = existing <Stage> 3D when available, framed by the yellow "93 of 100 claimed" stamp (live numbers from snapshot) and the box illustration as the static fallback. Meter bar with "7 remaining" text (exact, from live data). "How a drop works" 5-step numbered sequence with the copy from the reference. Delete the "Made with intention" section.
2. Drop (src/components/purchase.tsx or wherever /drop renders — read first): Frame 2. Lineup grid, every character shows Tier badge and "N of 100 boxes" (from catalog counts: nova/moss/tide/ember 21, eclipse/aurora 7, void 2 — put these as `units` in catalog.ts; the server still uses its own weights until M4). Secret character renders as dark silhouette named "Secret kin". Sticky light box-panel buy card: price in Unbounded, Stat grid (Left, Per person, Slot hold, Closes), Perforation, primary "Play to unlock", note "Free to play. No purchase needed to try the game." Sold-out state keeps the button "Sold out · Join waitlist" / "You’re on the waitlist".
3. Quest (src/components/quest.tsx): dark stage, Unbounded score/timer, keep .countdown and .fragment class names, keep "Start quest", "Pause quest", "Resume", lore buttons. Win screen heading "Quest cleared." with primary link "Claim preorder slot". Add a line "Free to play. You have N tries left today." ONLY if the snapshot provides it; otherwise omit (attempt limits arrive in M3/M5 — do not fake the number).
4. Checkout (/checkout): price-ticket card (panel variant), keep the checkbox and "Confirm demo preorder" (M5 replaces it). Show "Simulated payment (demo)" note.
5. Reveal (/reveal/[id], stage.tsx/scene.tsx presentation only): Frame 3. Implement the ≤2.4 s sequence from DESIGN.md with CSS/R3F: shake → split halves → foil burst in tier colour → name lands last. "Open my box" button starts it. Revisit = final frame immediately. prefers-reduced-motion = final frame. Keep heading = character name, text containing "You have a duplicate", link "Find a trade", buttons "Keep my kin" and "Save card", img named "<Character> collectible", canvas fallback behaviour.
6. Collection: cards on --orbit with Tier badges, duplicate badge, Empty state "No boxes yet" + primary "Explore the drop" (if that name would duplicate the home link in the same page, use "Go to the drop").
7. Trades: Frame 4. Two facing cards, yellow swap disc, heading "Two kin. Two happy collectors.", primary "Accept exchange", ghost "Decline", success text "Exchange complete." + link "See my updated collection". Wishlist step keeps checkboxes and "Find my match".

RULES:
- Change JSX structure only as needed for layout; never move business logic into components; never change API calls or their payloads.
- Use the ui/ primitives from M1. No new colours outside tokens. No inline style objects except dynamic values (e.g. character colour).
- Every screen gets loading (Skeleton), empty and error (ErrorNote with a retry action) states.

SCOPE OUT: studio, server, domain, tests.

ACCEPTANCE CRITERIA:
- All e2e tests pass with no test file changes (git diff m1-green -- tests/ empty).
- axe checks pass.
- Screenshots at 1360 and 390 of each screen in work/after-m2/ and a side-by-side list in the report: "Frame X ↔ screenshot Y: matches / differs because …".
- Lighthouse is NOT required; do not add it.

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e

MANUAL STEPS: full golden path click-by-click (home → drop → play lore → claim → confirm → open → find a trade → accept → collection) with what the human should SEE at each step, on desktop and on a phone.

Report in AGENTS.md section 22 format. Update PROJECT_STATE.md. Commit "M2: collector screens redesign", tag m2-green.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M3 — Studio, states, mobile polish + attempt limit (~2 h)

```
MILESTONE M3 — Studio redesign, attempt limit, mobile pass.

OBJECTIVE: Bring /studio to the new system (dense, calm, no foil, no motion), add the per-day attempt limit and DEMO win, and finish the mobile pass. After this, the human records backup video #1.

SCOPE IN:
1. Studio (src/components/studio.tsx): new tokens, tables in overflow-x:auto containers, Stat cards for plays, wins, win rate (wins/plays, 1 decimal %), confirmed orders, sell-through (paid/capacity), trades. Keep headings "Demand, before making." and "Ready to make.", buttons "Advance campaign", "Confirm phase change", "Edit campaign", "Save campaign", dialog role, input names.
2. Schema migration (forward-only, in schema.ts, idempotent): campaigns.required_score (default 10), campaigns.attempts_per_day (default 5), campaigns.game_mode (default 'run'). Service uses required_score instead of questConfig.requiredScore.
3. Attempt limit: startGame counts game_sessions for (user, campaign) since 00:00 Asia/Singapore; if ≥ attempts_per_day → DomainError('ATTEMPT_LIMIT',429). Snapshot returns attemptsLeft. Quest page shows "You have N tries left today." and a friendly limit-reached state. In DEMO_MODE the limit is 50 (so rehearsals don't lock you out).
4. demoWin action (DEMO_MODE only, else 404): creates a completed session with score=required_score and an access row exactly like a real win. Quest page shows a quiet button "Demo: win instantly" only in DEMO_MODE.
5. Studio edit dialog: add fields required_score and attempts_per_day (1–20) with Zod validation.
6. Mobile pass: every route at 390px — no overflow, tap targets ≥44px, bottom tab bar visible, sticky elements respect safe-area.
7. Unit tests: attempt limit (5 ok, 6th 429), demoWin 404 when DEMO_MODE=false, win-rate formula.

ACCEPTANCE CRITERIA: all previous tests + new tests pass; e2e green; screenshot of /studio at 1360 and 390 in work/after-m3/.

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e

MANUAL STEPS: include "play 5 times with DEMO_MODE=false and see the limit message" and "switch to studio and read the win rate".

Report in AGENTS.md section 22 format. Update PROJECT_STATE.md. Commit "M3: studio, attempts, mobile", tag m3-green. Remind the human: RECORD BACKUP VIDEO #1 NOW.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M4 — Fair committed pool + /verify (~4 h)

```
MILESTONE M4 — Verifiable fairness.

OBJECTIVE: Replace weighted-random allocation with a pre-shuffled, pre-committed pool of 100 units, and add a public page where anyone can check the draw wasn't changed.

SCOPE IN:
1. src/domain/fairness.ts exactly per AGENTS.md section 8 (buildPool, shuffle with HMAC-SHA256 Fisher–Yates, canonical, commitment). Pure, no DB. Also export verify(seedHex, orderIds, commitmentHex) → boolean.
2. Schema: pool_units, fairness_commitments, characters.units, allocations.pool_unit_id UNIQUE. Migration must work on a fresh DB AND on an existing demo DB (if existing allocations lack pool_unit_id, backfill by assigning positions 0..92 in allocation created_at order to units whose character matches; if impossible, document and require reset:demo).
3. Seed: counts 21/21/21/21/7/7/2. Fixed DEMO seed constant (DEMO_SEED_HEX in src/server/seed.ts) chosen so position 93 is 'eclipse' and positions 0–92 contain Alex's seeded Eclipse and Sarah's seeded Aurora consistent with existing seed users. Write a one-off script scripts/find-demo-seed.mjs that searches for such a seed and prints it; commit the script and the found constant. Outside DEMO_MODE, the seed is crypto.randomBytes(32).
4. Allocation: service.preorder (and later the webhook) takes the lowest-position unallocated unit inside the existing BEGIN IMMEDIATE transaction; sets allocated=1; inserts allocation with pool_unit_id. Remove the old weighted/demo-deterministic character choice. The capacity trigger stays.
5. Reveal seed on transition to PREORDER_CLOSED (studio "Advance campaign").
6. GET /api/verify?campaign=astral → {commitment, committedAt, revealed:boolean, seed?:string, order?:string[], yourPositions?:number[]} (seed/order only after reveal; yourPositions only for the signed-in user's allocations).
7. Page /verify/[campaign] per reference Frame 5: plain-English explanation; before close: "Fingerprint published <date>. The shuffle will be revealed when the preorder closes."; after close: recompute in the browser with Web Crypto (SubtleCrypto HMAC + SHA-256) AND show the server's result; green --aurora bar "Fingerprints match. The order was not changed." or --danger bar on mismatch; "Download shuffle CSV" (position,character_id); "Your box was position N". Include a visible note: "Demo note: this demo uses a fixed shuffle so the walkthrough is repeatable. The fingerprint was still published before any box in the demo was bought."
8. Tests: shuffle determinism; buildPool length check throws on mismatch; verify detects a single swapped position; allocation takes positions in order; 50 parallel preorder calls for the last 3 units → exactly 3 allocations and no duplicate pool_unit_id (use the same DB file with separate connections, as the existing concurrency e2e does); browser recompute equals server recompute (unit test with a known vector).
9. Add e2e step: after studio advances to PREORDER_CLOSED, open /verify/astral and expect text "Fingerprints match".

ACCEPTANCE CRITERIA: all tests green; golden path still yields Eclipse Knight as box 94; verify page shows match after close.

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e; node scripts/find-demo-seed.mjs --check

MANUAL STEPS: open /verify/astral before close (fingerprint only), buy a box, advance to Preorder closed in studio, reopen /verify/astral, see the green bar, download CSV, find your position in it.

Report in AGENTS.md section 22 format. Update PROJECT_STATE.md. Commit "M4: committed pool and verify page", tag m4-green.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M5 — Stripe test Checkout (~4 h)

```
MILESTONE M5 — Real test-mode payments.

OBJECTIVE: Replace "Confirm demo preorder" with Stripe Checkout (test mode). Allocation happens only after a verified, de-duplicated webhook. A DEMO simulate path keeps the demo working with no network.

BEFORE CODING: npm install stripe. Read node_modules/stripe/package.json for the version and read Stripe's official docs for: checkout.sessions.create parameters (line_items.price_data, metadata, client_reference_id, expires_at minimum), webhooks.constructEvent with a raw body in a Next.js route handler, refunds.create. Quote the doc sections you relied on in your report. Do not guess.

SCOPE IN (per AGENTS.md section 12):
1. Schema: orders status set + stripe_session_id + paid_at; payments; webhook_events; access.order_id; rewrite capacity_guard to count only PENDING_PAYMENT, PAID, DEMO_PAID.
2. Action `checkout {accessId, ageConfirmed:true}`: in one txn verify access AVAILABLE, owned, not expired; phase ACTIVE_PREORDER; per-user limit; create order PENDING_PAYMENT; access→RESERVED. Then (outside txn) create Checkout Session with amount from DB; store session id; return {url}. If Stripe is not configured and DEMO_MODE && SIMULATE_PAYMENTS → return {simulated:true, orderId}.
3. POST /api/stripe/webhook: raw body, signature check, dedupe via webhook_events, handle checkout.session.completed and checkout.session.expired exactly as spec. Allocation uses the M4 function inside the same txn. If capacity/phase no longer allows it → order REFUNDED, audit, stripe.refunds.create.
4. POST /api/stripe/simulate (DEMO only): builds a synthetic event {id:"sim_"+uuid} and calls the same internal handler function.
5. Pages: /checkout shows price ticket, age checkbox "I am 18 or older" (required), primary button "Pay with card"; /checkout/success polls GET /api/loopbox every 1.5 s up to 60 s until the order is PAID, then shows primary "Open my box"; timeout state explains and offers retry; /checkout?cancelled=1 shows "Payment cancelled. Your slot is still held until <time>."
6. Lazy expiry: any snapshot read expires PENDING_PAYMENT orders past session expiry and AVAILABLE access past 15 min.
7. audit_log table + writes for order created, paid, refunded, allocated.
8. Update ONE e2e step: "Confirm demo preorder" → check age box, click "Pay with card" (simulated path in e2e env: SIMULATE_PAYMENTS=true, no Stripe key). Report this change explicitly.
9. Tests: webhook same event ×3 → one allocation; bad signature → 400; checkout without ageConfirmed → 400; simulate returns 404 when DEMO_MODE=false; 50 parallel completions for last 3 units → 3 allocations + rest REFUNDED (mock the Stripe refund call via dependency injection, not by skipping logic).
10. README: exact local steps — stripe login, stripe listen --forward-to 127.0.0.1:3000/api/stripe/webhook, copy whsec into .env.local, test card 4242 4242 4242 4242 any future date any CVC.

ACCEPTANCE CRITERIA: all tests green; with real test keys the human completes a payment and sees the box; with no keys the simulated path works; no secret key appears in any client bundle (grep .next/static for "sk_test" returns nothing).

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e; grep -r "sk_test" .next/static || echo clean

MANUAL STEPS: two runs written out click by click — (A) real Stripe test mode with the CLI listening, (B) simulated mode with keys removed — expected screen at each step, including what the Stripe CLI terminal should print.

Report in AGENTS.md section 22 format. Update PROJECT_STATE.md. Commit "M5: Stripe test checkout", tag m5-green.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M6 — Admin close + manifest + audit (~2 h) → P0 COMPLETE

```
MILESTONE M6 — Admin close, manufacturing manifest, audit view.

OBJECTIVE: An admin can close the drop, lock allocations, download the manufacturing manifest and read the audit trail. After this, P0 is complete.

SCOPE IN:
1. ADMIN role (schema CHECK rebuild migration) + demo identity "Admin" in the switcher (DEMO only).
2. Studio for ADMIN: campaign list with phase, buttons Publish (IN_REVIEW→UPCOMING/ACTIVE_PREORDER, builds pool + commitment if missing), Close (→PREORDER_CLOSED, reveals seed), Advance (existing), Sweep (expire reservations/orders, re-run trade matching, auto-complete C2C later).
3. GET /api/manifest?campaign= → CSV per AGENTS.md section 14, Content-Disposition attachment; partner member of that campaign or ADMIN only. Studio button "Download manifest".
4. Audit view: last 200 audit_log rows, filter by entity; no PII displayed.
5. Tests: manifest totals equal count of final allocations; manifest 403 for other partner/collector; close is idempotent (second call 409 INVALID_STATE); after ALLOCATION_LOCKED, trade actions return 409.

ACCEPTANCE CRITERIA: e2e golden path extended to download the manifest (assert filename and that the total row equals allocated count); all tests green.

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e

MANUAL STEPS: switch to Admin, close, lock, download CSV, open it in Excel/Sheets, check the total.

Report in AGENTS.md section 22 format. Update PROJECT_STATE.md with "P0 COMPLETE". Commit "M6: admin close and manifest", tag m6-green and p0-complete. Tell the human: RECORD BACKUP VIDEO #2 AND TAKE SCREENSHOTS OF EVERY GOLDEN PATH SCREEN NOW.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M7 — B2B partner portal (~3 h)

```
MILESTONE M7 — Partner portal (thin but real).

OBJECTIVE: A brand or creator collective can apply, an admin approves, the partner drafts a campaign and submits it, the admin publishes, and the partner sees its dashboard.

SCOPE IN (AGENTS.md sections 5, 6, 14):
1. Schema: partners, partner_members, partner_applications; campaigns.partner_id, revenue_share_bps; phases DRAFT, IN_REVIEW, CANCELLED. Migrate the existing business to a BRAND partner "Astral Studio".
2. /partners landing (replace M1 stub): one-screen value proposition for both types in plain words ("Sell your series before you make it"), how it works (4 steps), what we take (revenue share, shown as "30% of paid orders — draft terms"), primary "Apply to launch a drop". Application form with type switch (Brand Collaborator / Creator Collective) and per-type fields, IP ownership statement required.
3. Admin: applications table with Approve / Reject / Request info + note.
4. Partner campaign editor /partner/campaign/[id]: series name, description, price, capacity, dates, game mode (run|lore), required score, attempts per day, characters (2–8; name, rarity, units, colour, description). Validation: Σ units = capacity. Read-only after publish (409 LOCKED_AFTER_LIVE). Character images: use colour + generated KinArt; image upload is P2 (TODO(STUB)).
5. Partner dashboard /partner: per-campaign Stats using the formulas in section 14 (plays, wins, win rate, paid, sell-through, trades, revenue, partner share) + manifest download.
6. Seed: "Kopi Kaki Collective" DRAFT campaign, "Hawker Heroes" SUBMITTED application.
7. Tests: approve creates partner + owner; partner A cannot read/edit partner B's campaign (IDOR); edit after publish → 409; Σ units ≠ capacity → 422; dashboard formulas on fixture data.

ACCEPTANCE CRITERIA: all tests green; new e2e test: apply as new user → switch to admin → approve → switch to partner → create and submit campaign → admin publishes → campaign appears on home as a second drop card.

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e

Report in AGENTS.md section 22 format with click-by-click manual steps. Update PROJECT_STATE.md. Commit "M7: partner portal", tag m7-green.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M8 — C2C marketplace (~5 h)

```
MILESTONE M8 — Creator marketplace (thin but real).

OBJECTIVE: A verified user lists their own blind-box series with declared stock; a buyer pays in-app; the platform draws each box weighted by remaining stock; the seller sees what to hand over; the buyer confirms or reports; the platform records its fee.

BUILD IN THIS ORDER, committing after each (so the cut plan can stop cleanly):
8a. Verification: users email/phone columns; /me/verify with simulated OTP (hashed code, 10-min expiry, 5 tries; DEMO shows the code on screen). Label "Demo verification — real SMS is future work".
8b. Listings: schema per section 5; /sell/new form (title, theme, description, price, fulfilment, 2–12 characters with rarity and declared stock, 1–6 photos); POST /api/upload with magic-byte sniffing, ≤2 MB, stored in data/uploads; image route with nosniff. Publish requires verified user (403 VERIFICATION_REQUIRED).
8c. Browse: /market grid (photo, title, price, "N left", seller name + trust score), filters theme / price range / rarity, text search on title. /market/[id] detail with full stock table (odds disclosure), quantity 1–10, age checkbox, "Buy boxes".
8d. Checkout + draw: src/domain/fee.ts and src/domain/draw.ts per sections 9 and 13; buyListing txn draws N boxes, decrements stock, creates market_order PENDING_PAYMENT with subtotal/fee/seller_owed; Stripe session (kind C2C) or simulate; webhook → PAID_HELD + payout HELD; expiry → EXPIRED + stock restored. Reveal page for the buyer shows each drawn character (reuse the reveal sequence, shorter: 1.2 s per box, "Skip" button).
8e. Orders: /orders with Buying / Selling tabs. Seller sees pick list ("Hand over: 2× Mango Mochi, 1× Durian Duke") and "Mark as fulfilled" with note. Buyer sees "Confirm received as drawn" and "Report a problem" (reason + details). Admin sees reports: Uphold / Dismiss; trust score recomputed; <50 suspends listings. Sweep auto-completes FULFILLED orders older than 7 days.
8f. Chat: /orders/[id]/chat, only the two parties, polling 5 s, 1000 chars, 30 msgs / 10 min, fixed banner "Pay only through LoopBox. Payments outside the app are not protected." Text rendering only.

TESTS (required): fee table (100→50 min, 625→50, 1000→80, 100000→8000); draw never selects remaining 0; 10k-run distribution within ±2 percentage points of stock share with a fixed PRNG injection for determinism; 50 parallel buys on 5 remaining → remaining never negative, Σ drawn ≤ 5; seller cannot buy own listing (403 + DB CHECK); unverified cannot publish; IDOR: other seller's listing edit, other seller's fulfil, other buyer's confirm, non-party chat read; c2c_draws UPDATE/DELETE blocked; chat body with <script> renders as text.

E2E: Alex buys 2 boxes from Mei (simulated payment) → sees reveal → switch to Mei → sees pick list → fulfils → switch to Alex → confirms → Mei's dashboard shows seller owed and platform fee.

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e

Report in AGENTS.md section 22 format with click-by-click manual steps. Update PROJECT_STATE.md. Commit "M8: creator marketplace", tag m8-green.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M9 — Hardening + FEATURE FREEZE (~2 h)

```
MILESTONE M9 — Hardening. After this, FEATURE FREEZE.

OBJECTIVE: Prove nobody can read or change what isn't theirs, every screen has all its states, and the demo survives bad input.

SCOPE IN:
1. tests/authz.test.ts covering every IDOR case in AGENTS.md section 17 plus RBAC matrix rows (one test per ✗ cell that has an endpoint).
2. Rate limiter (in-memory token bucket keyed by session token, fallback IP) on POST /api/loopbox (20/min) and chat (section 13). 429 RATE_LIMITED with a friendly UI message.
3. Audit sweep: grep src for console.log/console.error that prints email, phone, token, cookie → remove. grep for dangerouslySetInnerHTML → must be zero.
4. State sweep: for every route in AGENTS.md section 16, verify loading/empty/error states exist; list them in a table in the report (route | loading | empty | error).
5. Mobile sweep at 390px for every route (e2e loop asserting no horizontal scroll).
6. README: final sections per 4D below, LEGAL REVIEW REQUIRED, simulated vs real table.
7. DEMO_MODE=false smoke: demo identities, demoWin, simulate, OTP display all return 404/hidden.

ACCEPTANCE CRITERIA: all tests green; zero dangerouslySetInnerHTML; route-state table complete; DEMO_MODE=false smoke passes.

PROVE IT WITH: npm run typecheck; npm run lint; npm test; npm run build; npm run test:e2e; grep -rn "dangerouslySetInnerHTML" src || echo clean

Report in AGENTS.md section 22 format. Update PROJECT_STATE.md with "FEATURE FREEZE". Commit "M9: hardening", tag m9-green and freeze.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

#### M10 — P2 (only if every tag through m9-green exists AND there are 6+ hours left before H42)

```
MILESTONE M10 — One P2 item only. The human names which: (a) 3-way trade cycle detection, (b) listing image upload for partner characters, (c) second game template "puzzle". Implement ONLY the named item, behind a feature flag defaulting to off, with its own tests. If any existing test fails, revert to tag m9-green.

Do not start the next milestone. If a criterion cannot be met, report BROKEN with the root cause — never weaken the test.
```

### FALLBACK CUT PLAN

| If at hour… | You are still on… | Cut / thin |
|---|---|---|
| H12 | M2 | Thin M3: skip studio restyle beyond tokens; keep attempt limit + demoWin |
| H20 | M4 | Skip backfill migration; require reset:demo |
| H28 | M5 | Ship simulate-only payment, keep Stripe code behind flag; say so on screen |
| H30 | M6 | Start M8 at 8a–8d only |
| H33 | M8 | Cut 8f chat → then 8e report flow (keep confirm) |
| H35 | M7 not done | Partner dashboard charts → Stats only → then drop editor, use seeded partners |
| H38 | anything | Stop. Run M9 items 1, 3, 7 only. Freeze. |
| Never | — | Never cut M0–M6 (P0) |

---

### 4D — Demo & submission prompt

```
MILESTONE DEMO — Demo script, backups, README, pitch, judge Q&A. No new features.

Produce these files and nothing else:

1. DEMO.md — 90-second golden path, click by click, with the exact screen the audience should see after each click and the sentence the presenter says:
   0:00 Home — "Blind boxes today: bots buy the drop, factories guess demand. We fix both." (point at 93 of 100 stamp)
   0:10 Drop — lineup with odds on every kin → "Play to unlock"
   0:20 Quest — Demo: win instantly (or play lore) → "Quest cleared." → Claim preorder slot
   0:30 Checkout — tick 18+, Pay with card, 4242 4242 4242 4242 → success
   0:45 Reveal — box splits, rare foil, Eclipse Knight, "You have a duplicate"
   0:55 Trades — Find a trade → Aurora Warden → Find my match → Accept exchange → Exchange complete.
   1:10 Studio (Admin) — close → /verify/astral → green "Fingerprints match"
   1:20 Manifest download → "We make 94, not 100."
   1:30 End.
   Then a 30-second optional add-on: /market → buy from Mei → seller pick list.

2. Backups section in DEMO.md: A live URL (single host); B localhost (exact commands incl. reset:demo); C DEMO_MODE simulated payment (unplug Stripe CLI, still works); D screenshots folder path, one per step; E recorded video path. Include a pre-demo checklist: reset:demo, clear browser cookies, Stripe CLI running, phone hotspot ready, laptop charger, zoom 125% for projector.

3. README.md final: problem; solution (three models, one paragraph each); architecture diagram (from PROMPT_PACK section 7); fairness proof explained to a 12-year-old; setup; env vars table; seed + demo accounts; tests (commands and what they prove, with the latest actual pass counts — run them, do not guess); what is real vs simulated (table); limitations; LEGAL REVIEW REQUIRED (from AGENTS.md section 18); business model with every number labelled "projection" or "assumption"; future work (Postgres, Stripe Connect payouts, Singpass/MyInfo, native app, CAPTCHA, multi-way swaps).

4. PITCH.md — 5 minutes: 0:00–0:30 hook (one collector story, labelled hypothetical unless real); 0:30–1:15 problem (bots + overproduction; no invented statistics — use "we asked N collectors" only if the team actually did); 1:15–3:00 live demo per DEMO.md; 3:00–3:45 why us / fairness proof / tests (show the concurrency test output); 3:45–4:30 business (wedge = creator collectives; fee and revenue share as assumptions); 4:30–5:00 ask + what's next.

5. QA.md — the 30 hardest judge questions with strong, honest answers, covering: why a game gate; bots; rigging; demo seed; oversell; webhook failure; refunds; C2C fake stock; non-delivery; private payment; IP/counterfeit; gambling law; age gate; PDPA; liquidity of rare swaps; why not Pop Mart/Carousell/Shopee; CAC; take rate; manufacturing MOQ vs 100 units; margins; who manufactures; shipping; why SQLite; scaling; security testing; what's simulated; what you'd build next; why three models; team can't code — how do you maintain it; what you learned.

Every factual claim in these files must be true of the repo at tag freeze. Run the test commands and paste real counts. Report in AGENTS.md section 22 format.
```

---

## 9. Self-audit

| Check | Result | Note |
|---|---|---|
| Every 1.7 contradiction has keep/override | PASS | Section 4, plus 4 new ones found in the repo |
| Oversell impossible + tested (B2C, C2C) | PASS | Trigger + txn + M4/M5/M8 concurrency tests |
| Payment → allocation idempotent + verified | PASS | webhook_events PK, constructEvent, allocation UNIQUE(order_id) |
| B2C verifiable by outsider; C2C logged | PASS | /verify recompute in browser; immutable c2c_draws |
| Game not winnable by editing client state | PASS with caveat | Server recomputes score; scripted legal play still possible — disclosed |
| Integer cents, server-side, no secrets client-side | PASS | fee.ts, sk_test grep in M5 |
| Tenant isolation + tests | PASS | Service-layer authz + IDOR suite (RLS overridden, stated) |
| Runnable acceptance + plain-English steps per milestone | PASS | Every M block |
| DEMO_MODE works with no third-party network | PASS | Simulated payment, bundled fonts, simulated OTP |
| Fits 48 h incl. sleep, pitch, 6 h freeze, cut plan | PASS | ~31.5 h build, freeze H42–48 |
| No fabricated stats/APIs/legal claims | PASS | Stripe params delegated to docs check; fee/share/costs labelled ASSUMPTION |
| Spec alone defines every term | PASS | Glossary maps founder terms to existing code names |
| Works unchanged in Claude Code and Codex | PASS | AGENTS.md single source, CLAUDE.md imports it |
| Redesign won't silently break e2e | PASS | Protected-strings list (AGENTS.md §24) + diff-empty checks |

Initial FAILs I fixed while writing: (1) the founder spec required Supabase RLS on a SQLite repo → replaced with service authz + IDOR tests; (2) the "not rigged" wow moment contradicted the repo's hard-coded Eclipse Knight allocation → committed fixed seed with disclosure; (3) Stripe's minimum Checkout expiry may exceed the 15-min slot → reservation moves to RESERVED and holds the seat until the session expires, and the agent must confirm the minimum in docs.

---

## 10. NEXT 3 ACTIONS FOR THE HUMAN

1. Copy `AGENTS.md`, `DESIGN.md`, `PROJECT_STATE.md` to the repo root and `reference.html` to `design/reference.html`, make sure `CLAUDE.md` is only `@AGENTS.md`, commit, then paste the **4B kickoff** into Claude Code.
2. While M0 runs: create Stripe **test** API keys, install the Stripe CLI, and pick your single host (one with a persistent disk). Fill in the real rubric and fix the weights in section 2.
3. Talk to 3 real blind-box collectors or small creators today and write down their exact words. Your pitch currently has zero user evidence, and that is the first thing a judge will poke.
