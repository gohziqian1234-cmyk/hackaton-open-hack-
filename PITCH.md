# LoopBox pitch (5 minutes)

No statistic in this pitch is invented. Where a number is a design choice it is called an **assumption**; the story in the hook is **hypothetical**. If the team has spoken to real collectors, replace the hook with that story and say how many people you asked.

## 0:00–0:30 Hook (hypothetical story)

"Picture Wei Ling, a collector in Tampines. _(Hypothetical.)_ A new blind-box series drops at 8 pm. By 8:01 it's sold out — to resellers' bots. Two weeks later the same boxes are on a resale site at three times the price. Meanwhile the factory that made them guessed demand months ago, and half of one character is sitting unsold in a warehouse. Wei Ling didn't get a box. The brand still made too many. We think both problems have the same cause: everything is decided _before_ anyone knows who actually wants what."

## 0:30–1:15 Problem

- **Bots win drops.** First-come-first-served checkout rewards whoever clicks fastest, and scripts click faster than people.
- **Factories guess.** Series are manufactured to a forecast, then sold. Some characters are over-made, some sell out.
- **Trading happens after shipping.** Collectors who get duplicates mail boxes to each other to swap.
- **Blind boxes are hard to trust.** Buyers can't check that the rare wasn't quietly removed from the draw.

(No market-size or survey numbers are claimed. If the team ran interviews, say "we asked N collectors" with the real N.)

## 1:15–3:00 Live demo

Follow [DEMO.md](./DEMO.md) exactly: home → drop → free game → pay with card → reveal → same-rarity swap → close → verify → manifest. Land the line: **"We make 94, not 100."** If time allows, the 30-second marketplace add-on.

## 3:00–3:45 Why this works (and why you can trust it)

- **The draw can't be rigged after sales open.** We publish a SHA-256 fingerprint of the shuffled box order before the first sale and reveal the secret seed at close; anyone's browser re-runs the shuffle and checks the fingerprint. (The demo seed is fixed and disclosed, so the demo is repeatable — we say so on the page.)
- **The database refuses mistakes, not just the UI.** Caps, stock that can't go below zero, buyer ≠ seller, fee + seller share = total, and append-only logs are constraints and triggers in the database.
- **We test the ugly cases.** Show the test output: 50 simultaneous payments for the last 3 boxes → exactly 3 boxes and 47 refunds; 50 parallel marketplace buys for 5 boxes never go below zero; every "someone else's data" case returns 403/404. 148 unit tests and 10 browser tests pass at tag `freeze` (`npm test`, `npm run test:e2e`).
- **Security basics are in.** Password hashing, hashed session tokens, lockout, rate limits, same-origin checks, strict cookies, CSP, upload sniffing, live payment keys refused.

## 3:45–4:30 Business (assumptions, not results)

- **Wedge (assumption):** creator collectives — groups of independent artists who can't pay a factory's minimum order. With LoopBox every unit is paid for before it's made.
- **Three revenue lines:**
  - B2C drops we run: box price minus manufacturing.
  - Partner drops: the partner receives **30% of paid orders** (assumption, set per partner); LoopBox keeps the rest and runs the game, payments, fair draw and trade window.
  - Marketplace: **8% fee per order, minimum S$0.50** (assumption).
- **What we still need to prove:** willingness to play a short game for a slot, partner appetite for pre-sold runs, and unit costs at small quantities. We have **no** revenue or user numbers yet.
- **A lawyer's review is required** before any real launch (gambling law for paid chance-based boxes, consumer protection, PDPA, IP, held funds). It's listed in the README.

## 4:30–5:00 Ask and what's next

"We're asking for **[the prize / a pilot partner / mentorship — fill in]**. Next: one real creator collective running one small pre-sold drop, Stripe Connect so partners and sellers get paid automatically, real phone verification with Singpass, and a lawyer's review. LoopBox: sell it before you make it, prove the draw is fair, and let collectors swap before anything ships."
