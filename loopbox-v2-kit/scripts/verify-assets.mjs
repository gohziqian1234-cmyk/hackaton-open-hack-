// Usage (from repo root): node loopbox-v2-kit/scripts/verify-assets.mjs [publicDir]
// Checks every character in data/themes.seed.json has poster/hero/card/thumb images
// listed in data/image-manifest.json AND present on disk under publicDir (default: ./public).
// Exits 1 on any problem. No dependencies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kitDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.resolve(process.argv[2] || "public");
const seed = JSON.parse(fs.readFileSync(path.join(kitDir, "data/themes.seed.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(kitDir, "data/image-manifest.json"), "utf8"));
const VARIANTS = ["poster", "hero", "card", "thumb"];
let errors = 0, ok = 0;
const fail = (m) => { console.error("  ✗ " + m); errors++; };
const check = (p, label) => {
  const abs = path.join(publicDir, p);
  if (fs.existsSync(abs)) { ok++; } else fail(`${label}: missing file ${abs}`);
};

console.log(`Checking images in ${publicDir}\n`);
for (const t of seed.themes) {
  if (!t.characters) continue;
  console.log(`Theme ${t.slug}`);
  const cov = manifest[`${t.slug}/_cover`];
  if (!cov) fail(`${t.slug}: no cover in manifest`); else check(cov.cover.path, `${t.slug} cover`);
  for (const c of t.characters) {
    const key = `${t.slug}/${c.slug}`;
    const entry = manifest[key];
    if (!entry) { fail(`${key}: not in image-manifest.json`); continue; }
    for (const v of VARIANTS) {
      if (!entry[v]) fail(`${key}: variant '${v}' missing from manifest`);
      else check(entry[v].path, `${key} ${v}`);
    }
  }
}
const known = new Set(seed.themes.flatMap((t) => (t.characters || []).map((c) => `${t.slug}/${c.slug}`)));
for (const k of Object.keys(manifest)) if (!k.endsWith("/_cover") && !known.has(k)) fail(`manifest key ${k} has no character in seed`);

console.log(`\n${ok} files OK, ${errors} problem(s).`);
process.exit(errors ? 1 : 0);
