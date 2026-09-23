# Judge Q&A: the 30 hardest questions

Short, honest answers. Every claim about the product is true of the repository at tag `freeze`; where something is simulated, missing or an assumption, the answer says so.

## Fairness and trust

**1. Why make people play a game to buy?**
To slow down bots and give real fans a fair chance. The game is free, needs no purchase, and one win gives one slot for 15 minutes. There's an untimed lore challenge for people who can't play a reflex game. It also gives partners a demand signal (plays and wins) before anything is made.

**2. Can't bots just play the game?**
They can try, and we don't claim to stop a determined attacker. What we do: the server issues one-use game sessions and computes the score itself, checks timing, limits tries per person per day, caps boxes per person per drop (2 for Astral Kin), expires unused slots after 15 minutes, and rate-limits every endpoint. The README calls the game check a plausibility check, not authoritative anti-cheat. CAPTCHA and stronger bot detection are future work.

**3. How do I know you didn't rig who gets the rare?**
Before the first sale we shuffle every box with a secret seed and publish a SHA-256 fingerprint of the order. Boxes are handed out strictly in order. When preorders close we reveal the seed, and `/verify/<campaign>` re-runs the shuffle in your own browser and compares fingerprints. If we had moved a box, the fingerprints wouldn't match.

**4. But your demo seed is fixed. Isn't that rigging?**
For the demo, yes, it's chosen so box 94 is always Eclipse Knight, which makes the walkthrough repeatable. We say so on the verify page and in the README. The fingerprint still proves the order didn't change after it was published. Real drops get a fresh random seed when the admin publishes them.

**5. What stops you selling box 101?**
The database. The order table has a trigger that refuses an order above the campaign's cap, every pool unit can be allocated once (unique constraint), and all writes run in serialised transactions. A test fires 50 simultaneous payments at the last 3 boxes: exactly 3 get boxes and 47 are refunded. A second test does it across two server processes.

## Payments

**6. What if Stripe's webhook never arrives?**
The box isn't assigned until a signed webhook arrives, so nothing is given away by mistake. The waiting page polls for a minute, Stripe re-sends failed webhook deliveries, and the same event is processed only once. If payment never completes, the order expires after 31 minutes (Stripe's minimum session life is 30) and the box goes back into the pool. In the demo there is a labelled simulated-payment fallback.

**7. How do refunds work?**
Automatically when a payment arrives after its box was given away (it's refunded instead of overselling). In the marketplace, an admin who upholds a buyer's report refunds the buyer and voids the seller's payout. A general refund policy for preorders is not written yet; it's on the list for a lawyer's review in the README.

## Marketplace

**8. What if a seller lies about their stock?**
We can't verify declared stock in this version, and we say so. What limits the damage: sellers must verify email and phone, money is held until the buyer confirms receipt, buyers can report, upheld reports refund the buyer and drop the seller's trust score by 25, and at a trust score below 50 all their listings are suspended automatically.

**9. What if the seller never delivers?**
The buyer reports "Nothing arrived" while the money is still held. An admin upholds the report: the buyer is refunded, the seller isn't paid, and their trust score falls. If the buyer does nothing, orders marked as handed over complete after 7 days (on the admin's sweep).

**10. What stops buyer and seller paying each other privately to skip the fee?**
Nothing can fully stop it, but in-app payment is the only way the draw runs and the only way the buyer is protected. The chat shows a fixed banner: "Pay only through LoopBox. Payments outside the app are not protected."

**11. What about counterfeits and IP?**
Partners must state and tick that they own, or hold the rights to, every character, and brand partners must link proof of rights; an admin reviews every application and every campaign before it goes live. Marketplace sellers confirm they own the items. There is no automated counterfeit detection. IP rights are on the list for a lawyer's review.

## Law and privacy

**12. Isn't this gambling?**
It might be regulated as such. Paid, chance-based boxes and draws may fall under Singapore's Gambling Control Act 2022, and we have not yet had a lawyer's advice. The README has a "LEGAL REVIEW REQUIRED" section, and we make no claim that the product satisfies the law. What we do: show the odds or stock of every character before purchase, make the game free, and require an 18+ confirmation.

**13. How do you check age?**
A required "I am 18 or older" checkbox, enforced on the server (the payment is refused without it), with the confirmation time stored. That's a self-declaration, not verification. Singpass/MyInfo would be the real solution.

**14. What personal data do you keep? (PDPA)**
Display name, email, a password hash, a phone number for marketplace sellers, and the time of the 18+ confirmation. No date of birth, no NRIC. Logs and the audit trail hold ids only, never emails, phones or tokens. PDPA is on the list for a lawyer's review.

## Product and market

**15. Will anyone actually swap rares? There are only 7.**
Maybe not always — and that's fine: if no one wants your duplicate, you keep it. Matching is two-way, same rarity, first come first served, and both people must accept. Multi-way trade cycles would improve the odds of a match; they're future work.

**16. Why not just use Pop Mart, Carousell or Shopee?**
Big brands sell their own IP; general marketplaces trade boxes after they're made and don't show you the odds or prove the draw. LoopBox is for small creators who need pre-sold, fair, made-to-order runs, and for collectors who want to trade before anything ships. We haven't compared ourselves on price or scale, and we won't claim to beat them.

**17. How will you get users? What's your customer acquisition cost?**
We don't know our CAC and won't guess. The plan is to let partners bring their own followers (a creator collective's audience) and make the game shareable. The first test is one real collective running one small drop.

**18. What's your take rate?**
Assumptions, set by the founders: partner drops pay the partner 30% of paid orders; the marketplace fee is 8% of each order, minimum S$0.50. Both are in the code as settings, not proven prices.

**19. Factories have minimum orders. 100 units won't be economical.**
Possibly true for injection-moulded vinyl. 100 is just the demo's cap — each campaign sets its own. The model suits small-batch methods (resin casting, 3D printing, small vinyl runs) and creators who can't take stock risk. We have not verified unit costs at small quantities; that's the first thing a pilot must measure.

**20. What are your margins?**
Unknown. The S$18.90 box price is a demo assumption and we have no manufacturing quotes yet.

**21. Who manufactures and ships?**
In this prototype nobody: the manifest (a CSV of exactly how many of each character were paid for) is the hand-off. For partner drops the partner or their factory would make them; for our own drops, a contract manufacturer. Shipping is a phase in the app, not an integration. The marketplace supports post or meet-up, arranged by the seller.

## Technology

**22. Why SQLite? That's a toy database.**
It's a real, transactional database with constraints and triggers, and it needs no setup, which mattered in 48 hours. All the fairness and overselling rules are enforced in it. The trade-off: it runs on one server with a persistent disk. The README says not to deploy it to serverless platforms.

**23. How does it scale?**
On one server it handles a hackathon and a small pilot. For more, we'd move to PostgreSQL (the SQL is standard and every write already runs in one transaction), move rate limits to a shared store, and run several servers. We haven't load-tested beyond the concurrency tests.

**24. How did you test security?**
Automated tests, not a professional penetration test. They cover every "someone else's data" case in our spec (others' boxes, slots, trades, partner data, listings, orders, chats), every forbidden cell of the role matrix, webhook signatures and duplicates, spending caps, upload sniffing, a `<script>` chat message rendering as text, streaming size caps, and demo features being off when demo mode is off. We also scanned the git history for leaked secrets (none). An external pentest is needed before real money.

**25. What's simulated?**
Demo sign-in switcher, the instant-win button, payments when no Stripe keys are set, OTP codes (shown on screen, not sent), Sarah's acceptance of the swap in the scripted demo, the 93 earlier orders and the seeded listings, manufacturing and shipping, and all payouts. Stripe runs in test mode only; live keys are refused. The README has a real-vs-simulated table.

**26. What would you build next?**
One real pilot drop with a creator collective; Stripe Connect payouts for partners and sellers; real SMS and Singpass verification; CAPTCHA; multi-way swaps; PostgreSQL; a lawyer's review.

**27. Why three business models? Isn't that unfocused?**
They share one engine: a capped, fair, pre-paid draw. B2C proves it with our own series, B2B lets brands and collectives use it, C2C lets collectors sell their own. For the pilot we'd lead with one — creator collectives on the partner portal — and keep the others thin.

**28. Your team doesn't code. How will you maintain this?**
It was built by directing an AI coding agent against a written spec (`AGENTS.md`), one milestone at a time, and every milestone had to pass type checks, lint, 148 unit tests and 10 browser tests before it was committed. The agent reports in plain English with click-by-click checks we can do ourselves. That process keeps working, but before handling real money we would bring in an engineer to review and own it.

**29. What happens if your server goes down during a drop?**
Nobody can pay, so nobody is charged for a box they didn't get; unpaid orders simply expire and boxes return to the pool. Data lives in one database file on a persistent disk. For the demo, the laptop is the backup (see DEMO.md). A real launch needs a managed database and backups.

**30. What did you learn?**
That fairness has to be enforced where it can't be bypassed (the database and the server), not in the interface; that a demo is more convincing when it's honest about what's simulated; and that writing the spec and the tests first is what made it possible to build this without writing the code ourselves.
