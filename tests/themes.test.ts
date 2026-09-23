import { describe, expect, it } from 'vitest';
import { createDatabase, upsertThemes } from '../src/server/db';
import { seedThemes, type ThemeSeed } from '../src/server/themes';
import { verify } from '../src/domain/fairness';
import themeSeed from '../src/data/themes.seed.json';

const seed = themeSeed as ThemeSeed;

describe('v2 theme seed', () => {
  it('creates the 7 themes in order, 3 live with campaigns and 4 coming soon', () => {
    const db = createDatabase(':memory:');
    const rows = db
      .prepare('SELECT slug,status,campaign_id,is_licensed_concept FROM themes ORDER BY sort_order')
      .all() as { slug: string; status: string; campaign_id: string | null }[];
    expect(rows.map((r) => r.slug)).toEqual([
      'astral-kin',
      'naruto',
      'edgerunners',
      'jujutsu-kaisen',
      'genshin-impact',
      'sanrio',
      'spy-family',
    ]);
    expect(rows.filter((r) => r.status === 'live').map((r) => r.campaign_id)).toEqual([
      'astral',
      'naruto',
      'edgerunners',
    ]);
    expect(rows.filter((r) => r.status === 'coming_soon').every((r) => !r.campaign_id)).toBe(true);
    expect(db.prepare("SELECT 1 FROM themes WHERE slug LIKE '%pok%'").get()).toBeUndefined();
  });

  it('seeds the exact Naruto and Edgerunners lineups with a committed shuffle', () => {
    const db = createDatabase(':memory:');
    const lineup = (campaign: string) =>
      db
        .prepare(
          'SELECT slug,name,rarity,units FROM characters WHERE campaign_id=? ORDER BY rowid',
        )
        .all(campaign);
    expect(lineup('naruto')).toEqual([
      { slug: 'naruto', name: 'Naruto Uzumaki', rarity: 'COMMON', units: 40 },
      { slug: 'sakura', name: 'Sakura Haruno', rarity: 'COMMON', units: 40 },
      { slug: 'sasuke', name: 'Sasuke Uchiha', rarity: 'RARE', units: 15 },
      { slug: 'itachi', name: 'Itachi Uchiha', rarity: 'SECRET', units: 5 },
    ]);
    expect(lineup('edgerunners')).toEqual([
      { slug: 'rebecca', name: 'Rebecca', rarity: 'COMMON', units: 42 },
      { slug: 'david-martinez', name: 'David Martinez', rarity: 'RARE', units: 15 },
      { slug: 'lucy', name: 'Lucy', rarity: 'SECRET', units: 3 },
    ]);
    for (const [id, cap] of [
      ['naruto', 100],
      ['edgerunners', 60],
    ] as const) {
      const order = (
        db
          .prepare('SELECT character_id FROM pool_units WHERE campaign_id=? ORDER BY position')
          .all(id) as { character_id: string }[]
      ).map((r) => r.character_id);
      expect(order).toHaveLength(cap);
      const f = db
        .prepare('SELECT commitment_hex,seed_hex FROM fairness_commitments WHERE campaign_id=?')
        .get(id) as { commitment_hex: string; seed_hex: string };
      expect(verify(f.seed_hex, order, f.commitment_hex)).toBe(true);
      const c = db.prepare('SELECT phase,capacity,max_per_user FROM campaigns WHERE id=?').get(id);
      expect(c).toEqual({ phase: 'ACTIVE_PREORDER', capacity: cap, max_per_user: 2 });
    }
  });

  it('is idempotent: re-running never duplicates rows or moves the closing date', () => {
    const db = createDatabase(':memory:');
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    const snapshot = () => ({
      themes: count('SELECT COUNT(*) AS n FROM themes'),
      campaigns: count('SELECT COUNT(*) AS n FROM campaigns'),
      characters: count('SELECT COUNT(*) AS n FROM characters'),
      units: count('SELECT COUNT(*) AS n FROM pool_units'),
      closes: db.prepare("SELECT closes_at FROM themes WHERE slug='naruto'").get(),
    });
    const before = snapshot();
    upsertThemes(db, Date.now() + 5 * 86400000);
    db.exec('BEGIN IMMEDIATE');
    expect(seedThemes(db, seed, Date.now() + 9 * 86400000)).toBe(0);
    db.exec('COMMIT');
    expect(snapshot()).toEqual(before);
  });

  it('keeps Astral Kin characters untouched and links the theme to the astral campaign', () => {
    const db = createDatabase(':memory:');
    expect(
      db.prepare("SELECT id,slug,units FROM characters WHERE campaign_id='astral' ORDER BY rowid").all(),
    ).toEqual([
      { id: 'nova', slug: 'nova', units: 21 },
      { id: 'moss', slug: 'moss', units: 21 },
      { id: 'tide', slug: 'tide', units: 21 },
      { id: 'ember', slug: 'ember', units: 21 },
      { id: 'eclipse', slug: 'eclipse', units: 7 },
      { id: 'aurora', slug: 'aurora', units: 7 },
      { id: 'void', slug: 'void', units: 2 },
    ]);
    const t = db
      .prepare("SELECT payment_mode,is_licensed_concept,cover_image FROM themes WHERE slug='astral-kin'")
      .get();
    expect(t).toEqual({ payment_mode: 'stripe', is_licensed_concept: 0, cover_image: null });
  });

  it('refuses a live theme whose stock does not add up to its cap', () => {
    const db = createDatabase(':memory:');
    const bad: ThemeSeed = {
      themes: [{ ...seed.themes[1], slug: 'broken', unit_cap: 99 }],
    };
    db.exec('BEGIN IMMEDIATE');
    expect(() => seedThemes(db, bad, Date.now())).toThrow(/unit_cap/);
    db.exec('ROLLBACK');
  });
});

describe('drops browser data and notify me', () => {
  it('lists 7 theme cards with live counts and joins notify-me once per user', async () => {
    const { App } = await import('../src/server/app');
    const s = new App(createDatabase(':memory:'), () => Date.now(), true);
    const themes = s.themes();
    expect(themes.map((t) => t.status)).toEqual([
      'live',
      'live',
      'live',
      'coming_soon',
      'coming_soon',
      'coming_soon',
      'coming_soon',
    ]);
    const naruto = themes.find((t) => t.slug === 'naruto')!;
    expect(naruto).toMatchObject({
      licensed: true,
      payment_mode: 'demo',
      price: 1990,
      capacity: 100,
      claimed: 0,
      mix: { COMMON: 2, RARE: 1, SECRET: 1 },
    });
    expect(themes.find((t) => t.slug === 'astral-kin')).toMatchObject({
      licensed: false,
      payment_mode: 'stripe',
      claimed: 93,
    });
    s.notifyTheme('collector', 'sanrio');
    s.notifyTheme('collector', 'sanrio');
    expect(s.interest('collector')).toEqual(['sanrio']);
    expect(() => s.notifyTheme('collector', 'naruto')).toThrow('INVALID_STATE');
    expect(() => s.notifyTheme('collector', 'pokemon')).toThrow('NOT_FOUND');
  });
});
