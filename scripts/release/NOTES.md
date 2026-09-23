**Download → unzip → start.** No install step and no accounts needed.

1. Install **Node.js 22.13 or newer** (24 recommended) from https://nodejs.org.
2. Download **`loopbox-<version>.zip`** below (or the `.tar.gz` on macOS/Linux) and unzip it.
3. Start it:
   - **Windows:** double-click `start-windows.cmd`
   - **macOS / Linux:** run `./start-mac-linux.sh` in the unzipped folder
   - **Any system:** `node start.mjs`
4. Open **http://127.0.0.1:3000**.

It starts in demo mode with simulated payments (no card is charged): switch between the seeded accounts from **Me** or the top-right chip. Data is saved in the `data` folder next to the app; delete that folder to reset the demo to 93 of 100 boxes sold. Only your computer can open it unless you set `HOSTNAME=0.0.0.0`.

The 90-second demo script is in `DEMO.md` inside the download; `HOW-TO-RUN.txt` has the details.

This build passed type checks, lint, all unit tests, and browser tests of the golden path and a marketplace purchase run against this exact package before it was published.
