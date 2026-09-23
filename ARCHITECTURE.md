# Inspection and implementation decisions

The supplied GitHub repository returned `This repository is empty` on 23 September 2026. There was no package manifest, route, schema, component, stylesheet, environment configuration, build configuration, or application to preserve or run. This project initializes that empty repository; it does not replace a previous application.

## Boundaries

- Next.js App Router: discovery, campaign, quest, checkout, reveal, collection, trades, and studio routes.
- React components own presentation and transient interaction only.
- A validated JSON API owns identity, entitlements, orders, allocations, matching, and phase transitions.
- SQLite provides persisted relational data, foreign keys, constraints, unique entitlement redemption, and `BEGIN IMMEDIATE` transactions. Suitable for a single-host hackathon demo with a persistent disk. A multi-instance deployment requires PostgreSQL migration.
- HTTP-only random sessions resolve seeded identities on the server. Quick identity switching is explicitly demo authentication, not production authentication.
- Quest completion uses one-use server sessions. The server computes scores from the submitted trajectory and validates elapsed time and bounds. An untimed lore challenge provides equivalent access without motor requirements.
- All monetary values use integer SGD cents. Demo checkout processes no funds.
- Reveal reads the existing allocation. Opening, reloading, or revisiting cannot reroll it.
- Matching is a bounded reciprocal, same-campaign, same-rarity search; both allocations are reserved atomically. Both parties consent before ownership changes. Sarah is a labelled seeded demo participant with simulated consent.
- Advancing the campaign to allocation lock expires pending matches, removes preferences, and freezes allocations in the same transaction. Production reports are derived from allocations, not a forecast.

## Golden path

93 confirmed orders → Alex completes quest → one expiring entitlement → demo purchase → order 94 and Eclipse Knight allocation → reveal → duplicate detected → request Aurora Warden → reciprocal Sarah demo match → accept → updated collection → studio demand report → close preorder → trade window → allocation lock → final manufacturing plan.

## Visual direction

Graphite exhibition space, ivory editorial typography, copper accents, original sculptural space guardians. Restrained navigation and business tools. A spatial fragment-run game and a deliberately staged unboxing provide the principal animated moments. Geometry is generated in code; there are no copyrighted character assets or large model downloads.

## Verification gates

Every major stage runs TypeScript, ESLint, focused automated tests, and a production build. Final verification adds browser golden-path checks, failure states, refresh persistence, desktop/mobile overflow, WebGL fallback, and screenshots. Results and limitations are recorded in README.md.
