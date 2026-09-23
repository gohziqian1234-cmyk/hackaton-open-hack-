import { describe, it, expect } from 'vitest';
import { createDatabase } from '../src/server/db';
describe('deterministic foundation', () => {
  it('seeds 93 real orders and matching allocations', () => {
    const db = createDatabase(':memory:');
    expect(db.prepare('SELECT COUNT(*) AS n FROM orders').get()?.n).toBe(93);
    expect(db.prepare('SELECT COUNT(*) AS n FROM allocations').get()?.n).toBe(93);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.close();
  });
  it('contains a same-rarity demo match and a collector duplicate', () => {
    const db = createDatabase(':memory:');
    expect(
      db.prepare("SELECT character_id FROM allocations WHERE id='starter-eclipse'").get()
        ?.character_id,
    ).toBe('eclipse');
    expect(
      db.prepare("SELECT character_id FROM preferences WHERE allocation_id='sarah-aurora'").get()
        ?.character_id,
    ).toBe('eclipse');
    db.close();
  });
});
