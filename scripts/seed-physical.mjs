// Creates physical-figure QR codes: 20 per live theme (or PHYSICAL_COUNT), spread across each
// theme's characters, serials running on per character. The raw codes are printed ONCE here and
// written to a printable sheet under data/ (git-ignored); the database keeps only SHA-256 hashes,
// so they can never be recovered later. Admins can also make a fresh batch at /admin/qr-sheet.
// Usage: npm run seed:physical   (set NEXT_PUBLIC_APP_URL to the site the QR codes should open)
import './ts-resolve.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QRCode from 'qrcode';

const { createDatabase } = await import('../src/server/db.ts');
const { createBatch } = await import('../src/server/physical.ts');
const { serialLabel } = await import('../src/lib/format.ts');

const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const count = Math.max(1, Math.min(200, Number(process.env.PHYSICAL_COUNT) || 20));
const db = createDatabase(process.env.LOOPBOX_DB || 'data/loopbox.sqlite');
const themes = db
  .prepare("SELECT slug,name FROM themes WHERE status='live' AND campaign_id IS NOT NULL ORDER BY sort_order")
  .all();
const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cells = [];
db.exec('BEGIN IMMEDIATE');
try {
  for (const t of themes) {
    const batch = createBatch(db, t.slug, count, origin, Date.now());
    console.log(`\n${t.name} — ${batch.length} codes`);
    for (const b of batch) {
      console.log(`  ${b.character.padEnd(18)} ${serialLabel(b.serial_no, b.cap).padEnd(10)} ${b.code}  ${b.url}`);
      const svg = await QRCode.toString(b.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      cells.push(`<li>${svg}<strong>${escape(b.character)}</strong><span>${escape(serialLabel(b.serial_no, b.cap))} · ${escape(t.name)}</span><code>${b.code}</code></li>`);
    }
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('Failed:', e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  db.close();
}
mkdirSync(resolve('data'), { recursive: true });
const file = resolve('data', `qr-sheet-${new Date().toISOString().replace(/[:.]/g, '-')}.html`);
writeFileSync(
  file,
  `<!doctype html><meta charset="utf-8"><title>LoopBox QR sheet</title>
<style>@page{size:A4;margin:10mm}body{font:12px system-ui,sans-serif;margin:0}ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:4mm}
li{break-inside:avoid;border:1px dashed #999;padding:3mm;display:grid;justify-items:center;gap:1mm;text-align:center}svg{width:38mm;height:38mm}code{font-size:8px;word-break:break-all}</style>
<ul>${cells.join('')}</ul>`,
);
console.log(`\n${cells.length} codes. Printable sheet: ${file}`);
console.log('These codes are not stored anywhere else. Print or save them now.');
