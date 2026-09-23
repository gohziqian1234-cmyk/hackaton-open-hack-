import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../src/server/db';
import { migrations } from '../src/server/schema';

describe('forward-only migrations', () => {
  it('upgrades a database created by the original v1 app without losing data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loopbox-migrate-'));
    const file = join(dir, 'old.sqlite');
    try {
      // Build exactly what the v1 app created: base schema, seeded rows, user_version 0.
      const v1 = createDatabase(':memory:');
      const old = new DatabaseSync(file);
      migrations[0].up(old);
      const tables = ['businesses', 'users', 'campaigns', 'characters', 'orders', 'allocations'];
      for (const table of tables) {
        const cols = (v1.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
          .map((c) => c.name)
          .filter((name) =>
            (old.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
              (c) => c.name === name,
            ),
          );
        // v1 only knew collectors and businesses.
        const where = table === 'users' ? " WHERE role IN ('COLLECTOR','BUSINESS')" : '';
        const rows = v1.prepare(`SELECT ${cols.join(',')} FROM ${table}${where}`).all();
        const insert = old.prepare(
          `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        );
        old.exec('PRAGMA foreign_keys=OFF');
        for (const row of rows) insert.run(...cols.map((c) => (row as Record<string, never>)[c]));
      }
      old.exec('PRAGMA user_version=0');
      old.close();
      v1.close();

      const db = createDatabase(file);
      const version = (db.prepare('PRAGMA user_version').get() as { user_version: number })
        .user_version;
      expect(version).toBe(migrations[migrations.length - 1].id);
      expect(db.prepare('SELECT COUNT(*) AS n FROM orders').get()?.n).toBe(93);
      expect(db.prepare("SELECT required_score FROM campaigns WHERE id='astral'").get()).toEqual({
        required_score: 10,
      });
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(db.prepare("SELECT role FROM users WHERE id='admin'").get()).toEqual({ role: 'ADMIN' });
      expect(db.prepare("SELECT partner_id FROM campaigns WHERE id='astral'").get()).toEqual({
        partner_id: 'studio',
      });
      db.close();
      // Re-opening is a no-op.
      createDatabase(file).close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
