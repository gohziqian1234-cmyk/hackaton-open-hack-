import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { characters } from '../lib/catalog';
import { buildPool, commitment, newSeedHex, shuffle } from '../domain/fairness';
import { migrate, pragmas, wipeAll } from './schema';
import { DEMO_SEED_HEX, DEMO_SOLD } from './seed';
import { seedPartnerDemo } from './demo-data';
export function createDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(pragmas);
  migrate(db);
  seed(db);
  return db;
}
const LEGACY_WEIGHTS = [18, 17, 14, 16, 12, 11, 5];
/** Seeds the demo drop on an empty database (no campaigns). Clears any leftover rows first. */
export function seed(db: DatabaseSync) {
  if (db.prepare('SELECT id FROM campaigns LIMIT 1').get()) return;
  const now = Date.now();
  const demo = process.env.DEMO_MODE !== 'false';
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    // Re-check inside the write lock: another process may have seeded meanwhile.
    if (db.prepare('SELECT id FROM campaigns LIMIT 1').get()) {
      db.exec('COMMIT');
      return;
    }
    wipeAll(db);
    db.prepare('INSERT INTO businesses (id,name) VALUES (?,?)').run('studio', 'Astral Studio');
    const u = db.prepare('INSERT INTO users (id,name,role,created_at) VALUES (?,?,?,?)');
    u.run('collector', 'Alex', 'COLLECTOR', now);
    u.run('business', 'Astral Studio', 'BUSINESS', now);
    u.run('admin', 'Admin', 'ADMIN', now);
    for (let i = 0; i < 16; i++)
      u.run(
        'demo-' + i,
        i === 0 ? 'Sarah (demo)' : 'Collector ' + String(i + 1).padStart(2, '0'),
        'COLLECTOR',
        now,
      );
    db.prepare(
      'INSERT INTO partners (id,name,type,owner_user_id,created_at) VALUES (?,?,?,?,?)',
    ).run('studio', 'Astral Studio', 'BRAND', 'business', now);
    db.prepare(
      'INSERT INTO partner_members (partner_id,user_id,role,created_at) VALUES (?,?,?,?)',
    ).run('studio', 'business', 'OWNER', now);
    const startsAt = now - 86400000;
    db.prepare(
      'INSERT INTO campaigns (id,business_id,partner_id,name,description,price,capacity,max_per_user,phase,starts_at,ends_at,trade_ends_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'astral',
      'studio',
      'studio',
      'Astral Kin',
      'Seven guardians from the edge of the map. Four common, two rare and one secret. Made only when you choose to bring them home.',
      1890,
      100,
      2,
      'ACTIVE_PREORDER',
      startsAt,
      now + 7 * 86400000,
      now + 10 * 86400000,
      startsAt - 86400000,
    );
    const c = db.prepare(
      'INSERT INTO characters (id,campaign_id,name,rarity,weight,units,color,description) VALUES (?,?,?,?,?,?,?,?)',
    );
    characters.forEach((ch, i) =>
      c.run(ch.id, 'astral', ch.name, ch.rarity, LEGACY_WEIGHTS[i], ch.units, ch.color, ch.description),
    );
    // Shuffle all 100 boxes and publish the fingerprint before the first sale.
    const seedHex = demo ? DEMO_SEED_HEX : newSeedHex();
    const order = shuffle(buildPool(characters, 100), seedHex);
    db.prepare(
      'INSERT INTO fairness_commitments (campaign_id,commitment_hex,seed_hex,committed_at,created_at) VALUES (?,?,?,?,?)',
    ).run('astral', commitment(seedHex, order), seedHex, startsAt - 3600000, now);
    const unit = db.prepare(
      'INSERT INTO pool_units (id,campaign_id,position,character_id,allocated,created_at) VALUES (?,?,?,?,?,?)',
    );
    const unitIds = order.map((characterId, position) => {
      const id = 'unit-' + String(position).padStart(3, '0');
      unit.run(id, 'astral', position, characterId, position < DEMO_SOLD ? 1 : 0, now);
      return id;
    });
    // 93 seeded historical orders take positions 0–92 in order. Alex owns the first
    // Eclipse Knight; Sarah owns the first Aurora Warden and offers it for trade.
    const starter = order.indexOf('eclipse'),
      sarah = order.indexOf('aurora');
    const insertOrder = db.prepare(
      'INSERT INTO orders (id,user_id,campaign_id,amount,created_at) VALUES (?,?,?,?,?)',
    );
    const insertAllocation = db.prepare(
      'INSERT INTO allocations (id,order_id,campaign_id,owner_id,original_owner_id,character_id,status,revealed,created_at,pool_unit_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    );
    for (let n = 0; n < DEMO_SOLD; n++) {
      const owner = n === starter ? 'collector' : n === sarah ? 'demo-0' : 'demo-' + (n % 16);
      const orderId = 'seed-' + n;
      const allocation =
        n === starter ? 'starter-eclipse' : n === sarah ? 'sarah-aurora' : 'allocation-' + orderId;
      insertOrder.run(orderId, owner, 'astral', 1890, now - (DEMO_SOLD - n) * 60000);
      insertAllocation.run(
        allocation,
        orderId,
        'astral',
        owner,
        owner,
        order[n],
        allocation === 'sarah-aurora' ? 'TRADE_LISTED' : 'OWNED',
        1,
        now,
        unitIds[n],
      );
    }
    seedPartnerDemo(db, now);
    if (sarah >= 0 && sarah < DEMO_SOLD)
      db.prepare('INSERT INTO preferences (allocation_id,character_id) VALUES (?,?)').run(
        'sarah-aurora',
        'eclipse',
      );
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
}
const globalDb = globalThis as unknown as { loopboxDb?: DatabaseSync };
export function getDb() {
  return (globalDb.loopboxDb ??= createDatabase(process.env.LOOPBOX_DB || 'data/loopbox.sqlite'));
}
