// Upserts the /drops themes and characters from src/data/themes.seed.json. Idempotent: run it
// as often as you like (it never duplicates rows or reshuffles a published pool). The app also
// runs it on every start; use this to apply an edited seed file to an existing database.
// Usage: npm run seed:themes
import './ts-resolve.mjs';

const { createDatabase, upsertThemes } = await import('../src/server/db.ts');
// Opening the database migrates it and seeds the demo drop first if it is empty.
const db = createDatabase(process.env.LOOPBOX_DB || 'data/loopbox.sqlite');
try {
  upsertThemes(db);
  const rows = db.prepare('SELECT slug,status,campaign_id FROM themes ORDER BY sort_order').all();
  for (const r of rows)
    console.log(`${r.slug.padEnd(16)} ${r.status.padEnd(12)} ${r.campaign_id ?? '—'}`);
  const n = (sql) => db.prepare(sql).get().n;
  console.log(
    `${rows.length} themes, ${n('SELECT COUNT(*) AS n FROM campaigns')} campaigns, ${n('SELECT COUNT(*) AS n FROM characters')} characters.`,
  );
} catch (e) {
  console.error('Seeding failed:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  db.close();
}
