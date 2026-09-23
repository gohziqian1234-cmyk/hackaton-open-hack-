import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { characters } from '../lib/catalog';
import { schema } from './schema';
export function createDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(schema);
  seed(db);
  return db;
}
export function seed(db: DatabaseSync) {
  if (db.prepare('SELECT id FROM campaigns LIMIT 1').get()) return;
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO businesses VALUES (?,?)').run('studio', 'Astral Studio');
    const u = db.prepare('INSERT INTO users VALUES (?,?,?,?)');
    u.run('collector', 'Alex', 'COLLECTOR', now);
    u.run('business', 'Astral Studio', 'BUSINESS', now);
    for (let i = 0; i < 16; i++)
      u.run(
        'demo-' + i,
        i === 0 ? 'Sarah (demo)' : 'Collector ' + String(i + 1).padStart(2, '0'),
        'COLLECTOR',
        now,
      );
    db.prepare('INSERT INTO campaigns VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      'astral',
      'studio',
      'Astral Kin',
      'Fragments beyond the stars. Seven original companions, one shared constellation. Designed to be kept. Made only when you choose to bring them home.',
      1890,
      100,
      2,
      'ACTIVE_PREORDER',
      now - 86400000,
      now + 7 * 86400000,
      now + 10 * 86400000,
    );
    const c = db.prepare('INSERT INTO characters VALUES (?,?,?,?,?)');
    characters.forEach((ch, i) =>
      c.run(ch.id, 'astral', ch.name, ch.rarity, [18, 17, 14, 16, 12, 11, 5][i]),
    );
    const counts = [18, 17, 14, 16, 12, 11, 5];
    let n = 0;
    characters.forEach((ch, i) => {
      for (let j = 0; j < counts[i]; j++) {
        const owner =
          ch.id === 'eclipse' && j === 0
            ? 'collector'
            : ch.id === 'aurora' && j === 0
              ? 'demo-0'
              : 'demo-' + (n % 16);
        const id = 'seed-' + n++;
        db.prepare(
          'INSERT INTO orders (id,user_id,campaign_id,amount,created_at) VALUES (?,?,?,?,?)',
        ).run(id, owner, 'astral', 1890, now);
        const allocation =
          ch.id === 'eclipse' && j === 0
            ? 'starter-eclipse'
            : ch.id === 'aurora' && j === 0
              ? 'sarah-aurora'
              : 'allocation-' + id;
        db.prepare('INSERT INTO allocations VALUES (?,?,?,?,?,?,?,?,?)').run(
          allocation,
          id,
          'astral',
          owner,
          owner,
          ch.id,
          allocation === 'sarah-aurora' ? 'TRADE_LISTED' : 'OWNED',
          1,
          now,
        );
      }
    });
    db.prepare('INSERT INTO preferences VALUES (?,?)').run('sarah-aurora', 'eclipse');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
const globalDb = globalThis as unknown as { loopboxDb?: DatabaseSync };
export function getDb() {
  return (globalDb.loopboxDb ??= createDatabase(process.env.LOOPBOX_DB || 'data/loopbox.sqlite'));
}
