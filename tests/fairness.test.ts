import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPool, commitment, shuffle, verify } from '../src/domain/fairness';
import { buildPoolWeb, commitmentWeb, shuffleWeb } from '../src/lib/fairness-web';
import { characters } from '../src/lib/catalog';
import { createDatabase } from '../src/server/db';
import { DomainError, Loopbox } from '../src/server/service';
import { DEMO_SEED_HEX } from '../src/server/seed';

const SEED = '00'.repeat(31) + '01';
const small = [
  { id: 'a', units: 3 },
  { id: 'b', units: 2 },
  { id: 'c', units: 1 },
];
const open: Loopbox[] = [];
afterEach(() => {
  while (open.length) open.pop()!.db.close();
});
function service(db = createDatabase(':memory:')) {
  const s = new Loopbox(db, () => Date.now(), true);
  open.push(s);
  return s;
}

describe('committed shuffle (pure)', () => {
  it('builds exactly `capacity` units and refuses a mismatch', () => {
    expect(buildPool(small, 6)).toEqual(['a', 'a', 'a', 'b', 'b', 'c']);
    expect(() => buildPool(small, 7)).toThrow('POOL_SIZE_MISMATCH');
    expect(buildPool(characters, 100)).toHaveLength(100);
  });
  it('is deterministic for a seed and different for another seed', () => {
    const pool = buildPool(characters, 100);
    expect(shuffle(pool, DEMO_SEED_HEX)).toEqual(shuffle(pool, DEMO_SEED_HEX));
    expect(shuffle(pool, SEED)).not.toEqual(shuffle(pool, DEMO_SEED_HEX));
    expect([...shuffle(pool, SEED)].sort()).toEqual([...pool].sort());
  });
  it('matches a known vector (cross-checked with an independent Python implementation)', () => {
    const order = shuffle(buildPool(small, 6), SEED);
    expect(order).toEqual(['b', 'a', 'b', 'c', 'a', 'a']);
    expect(commitment(SEED, order)).toBe(
      'd6c267de8368f0a2f63363ba53651fde4dead9c3eb2bd458100d8b124270c761',
    );
  });
  it('detects a single swapped position', () => {
    const order = shuffle(buildPool(characters, 100), DEMO_SEED_HEX);
    const published = commitment(DEMO_SEED_HEX, order);
    expect(verify(DEMO_SEED_HEX, order, published)).toBe(true);
    const i = order.findIndex((id, k) => id !== order[k + 1]);
    const tampered = [...order];
    [tampered[i], tampered[i + 1]] = [tampered[i + 1], tampered[i]];
    expect(verify(DEMO_SEED_HEX, tampered, published)).toBe(false);
  });
  it('rejects malformed seeds', () => {
    expect(() => shuffle(['a'], 'not-hex')).toThrow('INVALID_SEED');
  });
  it('the browser (Web Crypto) recompute equals the server recompute', async () => {
    const vector = await shuffleWeb(buildPoolWeb(small), SEED);
    expect(vector).toEqual(['b', 'a', 'b', 'c', 'a', 'a']);
    expect(await commitmentWeb(SEED, vector)).toBe(commitment(SEED, vector));
    const pool = buildPool(characters, 100);
    const web = await shuffleWeb(buildPoolWeb(characters), DEMO_SEED_HEX);
    expect(web).toEqual(shuffle(pool, DEMO_SEED_HEX));
    expect(await commitmentWeb(DEMO_SEED_HEX, web)).toBe(commitment(DEMO_SEED_HEX, web));
  });
});

describe('committed pool in the database', () => {
  it('seeds 100 units, publishes a fingerprint, and sells positions 0–92 in order', () => {
    const s = service();
    const units = s.all<{ position: number; character_id: string; allocated: number }>(
      "SELECT position,character_id,allocated FROM pool_units WHERE campaign_id='astral' ORDER BY position",
    );
    expect(units).toHaveLength(100);
    expect(units.filter((u) => u.allocated).map((u) => u.position)).toEqual(
      Array.from({ length: 93 }, (_, i) => i),
    );
    const f = s.one<{ commitment_hex: string }>('SELECT * FROM fairness_commitments')!;
    expect(
      verify(
        DEMO_SEED_HEX,
        units.map((u) => u.character_id),
        f.commitment_hex,
      ),
    ).toBe(true);
    for (const c of characters)
      expect(units.filter((u) => u.character_id === c.id)).toHaveLength(c.units);
  });
  it('allocation takes the next positions in order: box 94 is Eclipse Knight', () => {
    const s = service();
    s.run('UPDATE campaigns SET max_per_user=5');
    const positions = [];
    for (let i = 0; i < 3; i++) {
      const g = s.startGame('collector', 'lore');
      const { accessId } = s.completeGame('collector', g.id, [1, 0, 2]);
      const { allocationId } = s.preorder('collector', accessId!);
      positions.push(
        s.one<{ position: number; character_id: string }>(
          'SELECT p.position,a.character_id FROM allocations a JOIN pool_units p ON p.id=a.pool_unit_id WHERE a.id=?',
          allocationId,
        ),
      );
    }
    expect(positions.map((p) => p!.position)).toEqual([93, 94, 95]);
    expect(positions[0]!.character_id).toBe('eclipse');
  });
  it('keeps the seed private until preorders close, then reveals it', () => {
    const s = service();
    const before = s.verification('astral', 'collector');
    expect(before.revealed).toBe(false);
    expect(before.seed).toBeUndefined();
    expect(before.order).toBeUndefined();
    expect(JSON.stringify(before)).not.toContain(DEMO_SEED_HEX);
    expect(before.yourPositions).toHaveLength(1);
    s.advance('business');
    const after = s.verification('astral', 'collector');
    expect(after.revealed).toBe(true);
    expect(after.seed).toBe(DEMO_SEED_HEX);
    expect(after.serverCheck).toMatchObject({ orderMatches: true, fingerprintMatches: true });
    expect(after.serverCheck!.recomputedCommitment).toBe(after.commitment);
  });
  it('pool order and fingerprint cannot be rewritten or deleted', () => {
    const s = service();
    expect(() => s.run("UPDATE pool_units SET character_id='void' WHERE position=93")).toThrow(
      'IMMUTABLE',
    );
    expect(() => s.run('UPDATE pool_units SET allocated=0 WHERE position=0')).toThrow('IMMUTABLE');
    expect(() => s.run('DELETE FROM pool_units')).toThrow('IMMUTABLE');
    expect(() => s.run("UPDATE fairness_commitments SET commitment_hex=?", 'f'.repeat(64))).toThrow(
      'IMMUTABLE',
    );
    expect(() => s.run('DELETE FROM fairness_commitments')).toThrow('IMMUTABLE');
  });
  it('refuses to raise capacity above the published pool', () => {
    const s = service();
    const c = s.campaign();
    const changes = {
      name: c.name,
      description: c.description,
      price: c.price,
      capacity: 101,
      max_per_user: c.max_per_user,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      trade_ends_at: c.trade_ends_at,
      weights: [18, 17, 14, 16, 12, 11, 5],
    };
    expect(() => s.edit('business', changes)).toThrow('LOCKED_AFTER_LIVE');
  });
  it('50 purchases for the last 3 units over 50 separate connections: exactly 3 win', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loopbox-pool-'));
    const file = join(dir, 'pool.sqlite');
    try {
      const setup = createDatabase(file);
      setup.exec(`UPDATE campaigns SET max_per_user=60;
        UPDATE pool_units SET allocated=1 WHERE campaign_id='astral' AND position BETWEEN 93 AND 96;`);
      const now = Date.now();
      const accessIds = Array.from({ length: 50 }, (_, i) => {
        const id = 'race-' + i;
        setup
          .prepare(
            'INSERT INTO access (id,user_id,campaign_id,earned_at,expires_at,status) VALUES (?,?,?,?,?,?)',
          )
          .run(id, 'collector', 'astral', now, now + 600000, 'AVAILABLE');
        return id;
      });
      setup.close();
      const buyers = accessIds.map(() => {
        const db = new DatabaseSync(file);
        db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
        return new Loopbox(db, () => now, true);
      });
      const outcomes = buyers.map((b, i) => {
        try {
          return b.preorder('collector', accessIds[i]).allocationId;
        } catch (e) {
          return e instanceof DomainError ? e.code : String(e);
        }
      });
      buyers.forEach((b) => b.db.close());
      expect(outcomes.filter((o) => o === 'SOLD_OUT')).toHaveLength(47);
      const check = new DatabaseSync(file);
      const rows = check
        .prepare("SELECT pool_unit_id FROM allocations WHERE campaign_id='astral'")
        .all() as { pool_unit_id: string }[];
      expect(rows).toHaveLength(96);
      expect(new Set(rows.map((r) => r.pool_unit_id)).size).toBe(96);
      expect(
        check
          .prepare("SELECT COUNT(*) AS n FROM pool_units WHERE campaign_id='astral' AND allocated=0")
          .get(),
      ).toEqual({ n: 0 });
      expect(check.prepare("SELECT COUNT(*) AS n FROM orders").get()).toEqual({ n: 96 });
      check.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
