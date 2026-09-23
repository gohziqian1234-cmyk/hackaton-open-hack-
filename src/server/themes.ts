// Idempotent upsert of the /drops themes and their characters from src/data/themes.seed.json.
// Called by the app on every database open and by `npm run seed:themes`. Imports stay
// extension-free and type-only-erasable so the CLI script can load this file with Node directly.
import type { DatabaseSync } from 'node:sqlite';
import { buildPool, commitment, newSeedHex, shuffle } from '../domain/fairness';

export type SeedCharacter = {
  slug: string;
  name: string;
  rarity: 'common' | 'rare' | 'secret';
  stock_total: number;
  lore: string;
};
export type SeedTheme = {
  slug: string;
  name: string;
  status: 'live' | 'coming_soon';
  payment_mode?: 'stripe' | 'demo';
  is_licensed_concept: boolean;
  order: number;
  tagline: string;
  description: string;
  accent: string;
  accent_secondary?: string;
  use_existing_characters?: boolean;
  price_cents?: number;
  unit_cap?: number;
  per_person_max?: number;
  slot_hold_minutes?: number;
  reservation_minutes?: number;
  closes_in_days?: number;
  cover_image?: string;
  characters?: SeedCharacter[];
};
export type ThemeSeed = { themes: SeedTheme[] };

/** Themes whose characters already live in the database under another campaign id. */
export const EXISTING_CAMPAIGNS: Record<string, string> = { 'astral-kin': 'astral' };
const DAY = 86400000;
const SLUG = /^[a-z0-9-]{1,64}$/;

/** Stable character id for a seeded theme character. */
export const characterId = (campaignId: string, slug: string) => `${campaignId}-${slug}`;

function validate(t: SeedTheme) {
  if (!SLUG.test(t.slug)) throw new Error(`Theme slug "${t.slug}" is not valid`);
  if (t.status !== 'live' || t.use_existing_characters) return;
  const chars = t.characters ?? [];
  if (!chars.length || !t.unit_cap || !t.price_cents || !t.per_person_max)
    throw new Error(`Live theme ${t.slug} needs characters, unit_cap, price_cents, per_person_max`);
  const total = chars.reduce((n, c) => n + c.stock_total, 0);
  if (total !== t.unit_cap)
    throw new Error(`Theme ${t.slug}: stock adds up to ${total}, unit_cap is ${t.unit_cap}`);
  for (const c of chars) if (!SLUG.test(c.slug)) throw new Error(`Bad character slug ${c.slug}`);
}

/**
 * Upserts every theme. Live themes with their own characters get a campaign (phase
 * ACTIVE_PREORDER) with a committed shuffle the first time only; later runs never touch stock,
 * the pool, prices or closing dates of a campaign that already exists. Caller holds the
 * transaction. Returns the number of campaigns created.
 */
export function seedThemes(db: DatabaseSync, seed: ThemeSeed, now: number) {
  let created = 0;
  const campaignExists = (id: string) =>
    !!db.prepare('SELECT 1 FROM campaigns WHERE id=?').get(id);
  for (const t of seed.themes) {
    validate(t);
    let campaignId: string | null = null;
    let closesAt: number | null = t.closes_in_days ? now + t.closes_in_days * DAY : null;
    if (t.status === 'live' && t.use_existing_characters) {
      const existing = EXISTING_CAMPAIGNS[t.slug] ?? t.slug;
      if (campaignExists(existing)) {
        campaignId = existing;
        const c = db.prepare('SELECT ends_at FROM campaigns WHERE id=?').get(existing) as {
          ends_at: number;
        };
        closesAt = c.ends_at;
        db.prepare('UPDATE characters SET slug=id WHERE campaign_id=? AND slug IS NULL').run(
          existing,
        );
      }
    } else if (t.status === 'live') {
      campaignId = t.slug;
      if (!campaignExists(campaignId)) {
        createCampaign(db, t, closesAt ?? now + 7 * DAY, now);
        created++;
      } else {
        // Names and lore may be corrected; stock is fixed once the shuffle is published.
        const update = db.prepare('UPDATE characters SET name=?,description=?,slug=? WHERE id=?');
        for (const c of t.characters ?? [])
          update.run(c.name, c.lore, c.slug, characterId(campaignId, c.slug));
      }
    }
    const cover = t.cover_image && t.cover_image.startsWith('/') ? t.cover_image : null;
    db.prepare(
      `INSERT INTO themes (id,slug,name,status,payment_mode,is_licensed_concept,sort_order,tagline,description,accent,accent_secondary,price_cents,unit_cap,per_person_max,slot_hold_minutes,reservation_minutes,closes_at,cover_image,campaign_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(slug) DO UPDATE SET name=excluded.name,status=excluded.status,payment_mode=excluded.payment_mode,is_licensed_concept=excluded.is_licensed_concept,sort_order=excluded.sort_order,tagline=excluded.tagline,description=excluded.description,accent=excluded.accent,accent_secondary=excluded.accent_secondary,price_cents=COALESCE(themes.price_cents,excluded.price_cents),unit_cap=COALESCE(themes.unit_cap,excluded.unit_cap),per_person_max=COALESCE(themes.per_person_max,excluded.per_person_max),slot_hold_minutes=excluded.slot_hold_minutes,reservation_minutes=excluded.reservation_minutes,closes_at=COALESCE(themes.closes_at,excluded.closes_at),cover_image=excluded.cover_image,campaign_id=COALESCE(themes.campaign_id,excluded.campaign_id),updated_at=excluded.updated_at`,
    ).run(
      t.slug,
      t.slug,
      t.name,
      t.status,
      t.status === 'live' ? (t.payment_mode ?? 'stripe') : null,
      t.is_licensed_concept ? 1 : 0,
      t.order,
      t.tagline,
      t.description,
      t.accent,
      t.accent_secondary ?? null,
      t.price_cents ?? null,
      t.unit_cap ?? null,
      t.per_person_max ?? null,
      t.slot_hold_minutes ?? 15,
      t.reservation_minutes ?? 30,
      closesAt,
      cover,
      campaignId,
      now,
      now,
    );
  }
  return created;
}

/** A new live concept drop: campaign, characters, shuffled pool and published fingerprint. */
function createCampaign(db: DatabaseSync, t: SeedTheme, closesAt: number, now: number) {
  const id = t.slug;
  const startsAt = now - 3600000;
  db.prepare(
    'INSERT INTO campaigns (id,partner_id,name,description,price,capacity,max_per_user,phase,starts_at,ends_at,trade_ends_at,game_mode,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    id,
    null,
    t.name,
    t.description,
    t.price_cents!,
    t.unit_cap!,
    t.per_person_max!,
    'ACTIVE_PREORDER',
    startsAt,
    closesAt,
    closesAt + 3 * DAY,
    'run',
    now,
  );
  const insert = db.prepare(
    'INSERT INTO characters (id,campaign_id,name,rarity,weight,units,color,description,slug) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  const chars = (t.characters ?? []).map((c) => ({ id: characterId(id, c.slug), units: c.stock_total }));
  (t.characters ?? []).forEach((c) =>
    insert.run(
      characterId(id, c.slug),
      id,
      c.name,
      c.rarity.toUpperCase(),
      c.stock_total,
      c.stock_total,
      t.accent,
      c.lore,
      c.slug,
    ),
  );
  const seedHex = newSeedHex();
  const order = shuffle(buildPool(chars, t.unit_cap!), seedHex);
  const unit = db.prepare(
    'INSERT INTO pool_units (id,campaign_id,position,character_id,allocated,created_at) VALUES (?,?,?,?,0,?)',
  );
  order.forEach((characterIdAt, position) =>
    unit.run(`${id}-unit-${String(position).padStart(3, '0')}`, id, position, characterIdAt, now),
  );
  db.prepare(
    'INSERT INTO fairness_commitments (campaign_id,commitment_hex,seed_hex,committed_at,created_at) VALUES (?,?,?,?,?)',
  ).run(id, commitment(seedHex, order), seedHex, startsAt - 60000, now);
}
