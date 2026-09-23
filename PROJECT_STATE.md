# PROJECT_STATE

GOAL: Win NYP Open Hack with a redesigned, live golden path (play → Stripe test pay → reveal → same-rarity swap → verify fairness) plus thin B2B and C2C, built entirely by prompting in 48 h.
DONE: M0 baseline and safety net — baseline-v1 tag, all checks green before changes (typecheck, lint, 23 unit, build, 5 e2e); .env.example lists Stripe/demo variables; `npm run reset:demo`; `GET /api/health`; `npm start` binds to HOSTNAME (default 127.0.0.1); README "Deploy (single host)"; Playwright can use a local Chromium via PW_CHROMIUM_PATH.
IN PROGRESS: nothing
BLOCKED: nothing
BUGS: none recorded yet
DECISIONS: keep SQLite + single host (no Supabase/Vercel); in-app payment only for C2C; fixed disclosed demo seed; CAPTCHA moved to P2; Codex used as read-only reviewer. Playwright keeps `channel: 'chrome'` by default; PW_CHROMIUM_PATH overrides it for machines without Chrome.
NEXT 3 ACTIONS: 1) run M1 design system  2) run M2 collector screens  3) run M3 studio + attempts
LAST GREEN TAG: m0-green
