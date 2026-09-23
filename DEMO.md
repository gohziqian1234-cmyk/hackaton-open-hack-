# LoopBox demo script

90 seconds for the golden path, plus an optional 30-second marketplace add-on. Every button name below is the exact label on screen; the same path runs in the automated browser test, so it is known to work at tag `freeze`.

Start state: a freshly seeded database (93 of 100 Astral Kin boxes claimed), signed in as **Alex** (the demo collector).

## The 90-second golden path

| Time | Click                                                                                                                                            | You should see                                                                                                                      | Say                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00 | Open the site (`/`)                                                                                                                              | Heading "A little mystery…", the box stage with the **93 / claimed** stamp and the 93/100 meter                                     | "Blind boxes today: bots buy the drop, factories guess demand. We fix both." (point at the 93 of 100 stamp)                                      |
| 0:10 | **Explore the drop**                                                                                                                             | "Astral Kin™", the seven characters with how many boxes each has (e.g. 7 of 100 for the rares), "7 remaining"                       | "Every character's odds are on the page before you pay." → click **Play to unlock**                                                              |
| 0:20 | **Demo: win instantly** (or **Untimed lore challenge** → **Start lore challenge** and answer the three questions)                                | "Quest cleared."                                                                                                                    | "The game is free. Winning gives one preorder slot for 15 minutes, a few tries a day, so bots can't farm slots." → click **Claim preorder slot** |
| 0:30 | Tick **I am 18 or older**, then **Pay with card**. With Stripe test keys: card `4242 4242 4242 4242`, any future date, any CVC                   | Without keys: the "Simulated payment (demo)" label, then the success page. With keys: Stripe's test checkout, then the success page | "The box is assigned only when Stripe's signed webhook arrives, never by the browser."                                                           |
| 0:45 | **Open my box**                                                                                                                                  | Box shakes and splits, rare foil burst, "Eclipse Knight", "Box 94 of 100", "You have a duplicate"                                   | "The box was fixed the moment he paid: position 94 in a shuffle we fingerprinted before sales opened."                                           |
| 0:55 | **Find a trade** → tick **Aurora Warden** → **Find my match** → **Accept exchange**                                                              | "Two kin. Two happy collectors." then "Exchange complete."                                                                          | "Duplicates swap before anything is made, only inside the same rarity, and both people must accept."                                             |
| 1:10 | Top-right chip **Demo collector** (switches to Astral Studio) → on the studio page: **Advance campaign** → **Confirm phase change**, three times | "Demand, before making." then "Ready to make." (preorders closed, trade window, allocations locked)                                 | "Closing the preorder reveals the secret seed."                                                                                                  |
| 1:15 | Open `/verify/astral`                                                                                                                            | Green bar: "Fingerprints match. The order was not changed…"                                                                         | "Anyone can re-run the shuffle in their own browser and check we didn't move a box."                                                             |
| 1:20 | Back on `/studio`: **Download manifest**                                                                                                         | `manifest-astral-<date>.csv`; last row `astral,TOTAL,,,94`                                                                          | "We make 94, not 100."                                                                                                                           |
| 1:30 | End                                                                                                                                              |                                                                                                                                     |                                                                                                                                                  |

## Optional 30-second add-on: the creator marketplace

1. Open **Marketplace** → **Tropical Treats** (Mei, trust 96). Point at the stock-and-odds table.
2. Set **Boxes** to 2, tick **I am 18 or older**, **Buy boxes** → the two boxes open one after another (or **Skip**).
3. Open **Me** → _Demo identities_ → **Mei** → open the same order from **My orders** → **Selling**: the pick list says "Hand over: …" → **Mark as fulfilled**.
4. Switch back to **Alex**, open the order → **Confirm received as drawn**. Mei's **Seller dashboard** now shows S$22.08 seller owed and S$3.84 platform fee.

Say: "Collectors sell their own series. The draw is weighted by the stock they declared, the money is held until the buyer confirms, and chat warns people never to pay outside the app."

## Backups

**A. Live URL (single host).** Deploy with the Render link in the README. Open the site once 2 minutes before the demo (the free plan sleeps after 15 idle minutes and the first request takes about a minute). A restart re-seeds the demo to 93 / 100.

**B. Localhost (the laptop).**

```bash
npm ci
npm run build
npm run reset:demo      # with the server stopped: fresh 93 / 100 data
npm start               # http://127.0.0.1:3000
```

**C. Simulated payment.** If Stripe or the Stripe CLI misbehaves, stop the CLI and remove `STRIPE_SECRET_KEY` (or keep `SIMULATE_PAYMENTS=true`): **Pay with card** then runs the simulated payment through the same server step, labelled "Simulated payment (demo)". If a real payment's webhook never arrives, the waiting page offers **Simulate payment (demo)** after 60 seconds.

**D. Screenshots.** One per step, from the automated run: `docs/screenshots/` (01-home, 02-drop, 03-checkout, 04-reveal, 05-match, 06-collection, 07-studio, 08-verify, 09-partner-drop, 10-listing, 11-pick-list, 12-seller).

**E. Recorded video.** Record the golden path on the laptop before the event and save it as `docs/demo.mp4` (not in the repository yet — the team records it).

## Pre-demo checklist

- [ ] `npm run reset:demo`, then start the server (or open the live URL to wake it).
- [ ] Clear browser cookies for the site, or open a private window.
- [ ] Stripe CLI running (`stripe listen --forward-to 127.0.0.1:3000/api/stripe/webhook`) if using real test payments; otherwise leave the keys empty.
- [ ] Phone hotspot ready in case the venue Wi-Fi fails.
- [ ] Laptop charger plugged in.
- [ ] Browser zoom 125% for the projector.
- [ ] Screenshots folder and the recorded video open in another window.
