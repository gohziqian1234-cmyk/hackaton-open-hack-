// Renders ad.html frame by frame. Usage: node render.mjs <v|h> <outDir> [fps] [onlyTimes,comma]
import { chromium } from '/home/user/hackaton-open-hack-/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const [mode = 'v', out = '/tmp/frames', fpsArg = '30', only] = process.argv.slice(2);
const fps = Number(fpsArg);
const tl = JSON.parse(fs.readFileSync(path.join(here, '..', 'timeline.json'), 'utf8'));
const [w, h] = mode === 'v' ? [1080, 1920] : [1920, 1080];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGEERR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
await page.addInitScript((t) => { window.TIMELINE = t; }, tl);
await page.goto('file://' + path.join(here, '..', 'ad.html'));
await page.evaluate(() => window.ready);
const times = only ? only.split(',').map(Number) : [...Array(Math.ceil(tl.end * fps)).keys()].map((i) => i / fps);
let i = 0;
for (const t of times) {
  await page.evaluate((t) => window.render(t), t);
  const name = only ? `t${t.toFixed(2)}.jpg` : `f${String(i).padStart(5, '0')}.jpg`;
  await page.screenshot({ path: path.join(out, name), type: 'jpeg', quality: 92 });
  i++;
  if (i % 100 === 0) console.log(mode, i, '/', times.length);
}
await browser.close();
