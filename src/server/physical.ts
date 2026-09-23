// Physical LoopBox figures that owners add to their digital collection by QR code.
// Each figure has one random 128-bit code (base32, no padding). Only its SHA-256 is stored, so a
// code is shown exactly once: in the seed script's output or on the admin sheet that made it.
// Erasable TypeScript only: `scripts/seed-physical.mjs` loads this file with Node directly.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const CODE_LENGTH = 26; // ceil(128 / 5)

/** RFC 4648 base32 without padding. */
export function base32(bytes: Uint8Array) {
  let bits = 0,
    value = 0,
    out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export const newCode = () => base32(randomBytes(16));
export const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

/**
 * Accepts a bare code, a code typed with spaces or dashes, or the full claim URL, and returns
 * the canonical code, or null when it cannot be a LoopBox code.
 */
export function normalizeCode(input: string) {
  let text = input.trim();
  const at = text.lastIndexOf('/claim/');
  if (at >= 0) text = text.slice(at + 7).split(/[?#/]/)[0];
  const code = text.toUpperCase().replace(/[\s-]/g, '');
  return code.length === CODE_LENGTH && /^[A-Z2-7]+$/.test(code) ? code : null;
}

export type NewPhysical = {
  id: string;
  code: string;
  url: string;
  character_id: string;
  character: string;
  rarity: string;
  serial_no: number;
  cap: number;
};

/**
 * Creates `count` physical figures for one live theme, spread across its characters in
 * proportion to their stock (every character gets at least one), with serial numbers running on
 * per character. Caller holds the transaction. Returns the raw codes: they are never stored.
 */
export function createBatch(
  db: DatabaseSync,
  themeSlug: string,
  count: number,
  origin: string,
  now: number,
): NewPhysical[] {
  const theme = db
    .prepare('SELECT id,campaign_id FROM themes WHERE slug=? AND status=? AND campaign_id IS NOT NULL')
    .get(themeSlug, 'live') as { id: string; campaign_id: string } | undefined;
  if (!theme) throw new Error('NOT_FOUND');
  const cap = (
    db.prepare('SELECT capacity FROM campaigns WHERE id=?').get(theme.campaign_id) as {
      capacity: number;
    }
  ).capacity;
  const chars = db
    .prepare('SELECT id,name,rarity,units FROM characters WHERE campaign_id=? ORDER BY rowid')
    .all(theme.campaign_id) as { id: string; name: string; rarity: string; units: number }[];
  const total = chars.reduce((n, c) => n + c.units, 0) || 1;
  // Largest-remainder split, at least one each.
  const shares = chars.map((c) => {
    const exact = (c.units / total) * Math.max(count - chars.length, 0);
    return { c, n: 1 + Math.floor(exact), rest: exact % 1 };
  });
  let left = count - shares.reduce((n, s) => n + s.n, 0);
  for (const s of [...shares].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    s.n++;
    left--;
  }
  const insert = db.prepare(
    'INSERT INTO physical_items (id,code_hash,theme_id,character_id,serial_no,created_at) VALUES (?,?,?,?,?,?)',
  );
  const out: NewPhysical[] = [];
  for (const { c, n } of shares) {
    let serial = (
      db
        .prepare('SELECT COALESCE(MAX(serial_no),0) AS n FROM physical_items WHERE character_id=?')
        .get(c.id) as { n: number }
    ).n;
    for (let i = 0; i < n; i++) {
      const code = newCode();
      const id = randomUUID();
      serial++;
      insert.run(id, hashCode(code), theme.id, c.id, serial, now);
      out.push({
        id,
        code,
        url: origin.replace(/\/+$/, '') + '/claim/' + code,
        character_id: c.id,
        character: c.name,
        rarity: c.rarity,
        serial_no: serial,
        cap,
      });
    }
  }
  return out;
}
