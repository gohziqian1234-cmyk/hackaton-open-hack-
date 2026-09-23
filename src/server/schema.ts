import type { DatabaseSync } from 'node:sqlite';

export const pragmas = `
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
`;

/** v1 schema from the original hackathon build. Never edit; add a migration instead. */
const v1 = `
CREATE TABLE IF NOT EXISTS businesses(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('COLLECTOR','BUSINESS')),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY,business_id TEXT REFERENCES businesses(id),name TEXT NOT NULL,description TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),capacity INTEGER NOT NULL CHECK(capacity>0),max_per_user INTEGER NOT NULL CHECK(max_per_user>0),phase TEXT NOT NULL CHECK(phase IN ('UPCOMING','ACTIVE_PREORDER','PREORDER_CLOSED','TRADE_WINDOW','ALLOCATION_LOCKED','IN_PRODUCTION','SHIPPING','COMPLETED')),starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,trade_ends_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),name TEXT NOT NULL,rarity TEXT NOT NULL CHECK(rarity IN ('COMMON','RARE','SECRET')),weight REAL NOT NULL CHECK(weight>0));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS game_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),campaign_id TEXT NOT NULL REFERENCES campaigns(id),mode TEXT NOT NULL,started_at INTEGER NOT NULL,completed_at INTEGER,score INTEGER,seed INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS access(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),campaign_id TEXT NOT NULL REFERENCES campaigns(id),game_id TEXT UNIQUE REFERENCES game_sessions(id),earned_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('AVAILABLE','RESERVED','REDEEMED','EXPIRED')));
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),campaign_id TEXT NOT NULL REFERENCES campaigns(id),access_id TEXT UNIQUE REFERENCES access(id),amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'DEMO_PAID',created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS allocations(id TEXT PRIMARY KEY,order_id TEXT UNIQUE NOT NULL REFERENCES orders(id),campaign_id TEXT NOT NULL REFERENCES campaigns(id),owner_id TEXT NOT NULL REFERENCES users(id),original_owner_id TEXT NOT NULL REFERENCES users(id),character_id TEXT NOT NULL REFERENCES characters(id),status TEXT NOT NULL CHECK(status IN ('OWNED','TRADE_LISTED','TRADE_PENDING','LOCKED_FOR_PRODUCTION')),revealed INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS preferences(allocation_id TEXT NOT NULL REFERENCES allocations(id),character_id TEXT NOT NULL REFERENCES characters(id),PRIMARY KEY(allocation_id,character_id));
CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),a_id TEXT NOT NULL REFERENCES allocations(id),b_id TEXT NOT NULL REFERENCES allocations(id),a_user TEXT NOT NULL REFERENCES users(id),b_user TEXT NOT NULL REFERENCES users(id),a_accept INTEGER NOT NULL DEFAULT 0,b_accept INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL CHECK(status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED')),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS waitlist(user_id TEXT REFERENCES users(id),campaign_id TEXT REFERENCES campaigns(id),PRIMARY KEY(user_id,campaign_id));
CREATE INDEX IF NOT EXISTS orders_campaign ON orders(campaign_id,user_id);
CREATE INDEX IF NOT EXISTS access_user ON access(user_id,status);
CREATE INDEX IF NOT EXISTS allocations_owner ON allocations(owner_id,campaign_id);
CREATE INDEX IF NOT EXISTS preferences_character ON preferences(character_id);
CREATE INDEX IF NOT EXISTS matches_users ON matches(a_user,b_user,status);
CREATE TRIGGER IF NOT EXISTS capacity_guard BEFORE INSERT ON orders BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM orders WHERE campaign_id=NEW.campaign_id)>=(SELECT capacity FROM campaigns WHERE id=NEW.campaign_id) THEN RAISE(ABORT,'SOLD_OUT') END; END;
`;

type Migration = { id: number; name: string; up: (db: DatabaseSync) => void };

function hasColumn(db: DatabaseSync, table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
    (c) => c.name === column,
  );
}
function addColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * Guards that make records append-only. Kept here so a demo reset can drop and recreate them.
 * Each entry is [trigger name, CREATE statement].
 */
export const guardTriggers: [string, string][] = [
  [
    'pool_units_fixed',
    "CREATE TRIGGER IF NOT EXISTS pool_units_fixed BEFORE UPDATE OF campaign_id,position,character_id ON pool_units BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;",
  ],
  [
    'pool_units_no_unallocate',
    "CREATE TRIGGER IF NOT EXISTS pool_units_no_unallocate BEFORE UPDATE OF allocated ON pool_units WHEN OLD.allocated=1 AND NEW.allocated=0 BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;",
  ],
  [
    'pool_units_no_delete',
    "CREATE TRIGGER IF NOT EXISTS pool_units_no_delete BEFORE DELETE ON pool_units BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;",
  ],
  [
    'commitment_fixed',
    "CREATE TRIGGER IF NOT EXISTS commitment_fixed BEFORE UPDATE OF campaign_id,commitment_hex,seed_hex,committed_at ON fairness_commitments BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;",
  ],
  [
    'commitment_no_delete',
    "CREATE TRIGGER IF NOT EXISTS commitment_no_delete BEFORE DELETE ON fairness_commitments BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;",
  ],
];
const createGuards = (db: DatabaseSync, names: string[]) =>
  guardTriggers.filter(([name]) => names.includes(name)).forEach(([, sql]) => db.exec(sql));

/** Removes every row from every table (demo reset). Caller must have foreign keys off. */
export function wipeAll(db: DatabaseSync) {
  const present = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as { name: string }[]).map(
      (t) => t.name,
    ),
  );
  const guards = guardTriggers.filter(([name]) => present.has(name));
  for (const [name] of guards) db.exec(`DROP TRIGGER ${name}`);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  for (const { name } of tables) db.exec(`DELETE FROM ${name}`);
  for (const [, sql] of guards) db.exec(sql);
}

/** Forward-only. Each migration runs once, in order, inside its own transaction. */
export const migrations: Migration[] = [
  { id: 1, name: 'v1 base schema', up: (db) => db.exec(v1) },
  {
    id: 2,
    name: 'M3 game settings and attempt tracking',
    up: (db) => {
      addColumn(db, 'campaigns', 'required_score', 'INTEGER NOT NULL DEFAULT 10 CHECK(required_score BETWEEN 1 AND 15)');
      addColumn(db, 'campaigns', 'attempts_per_day', 'INTEGER NOT NULL DEFAULT 5 CHECK(attempts_per_day BETWEEN 1 AND 20)');
      addColumn(db, 'campaigns', 'game_mode', "TEXT NOT NULL DEFAULT 'run' CHECK(game_mode IN ('run','lore'))");
      addColumn(db, 'game_sessions', 'won', 'INTEGER NOT NULL DEFAULT 0 CHECK(won IN (0,1))');
      db.exec(`UPDATE game_sessions SET won=1 WHERE completed_at IS NOT NULL AND ((mode='run' AND score>=10) OR (mode='lore' AND score=3));
        CREATE INDEX IF NOT EXISTS game_sessions_attempts ON game_sessions(user_id,campaign_id,started_at);`);
    },
  },
  {
    id: 3,
    name: 'M4 committed pool and fairness proof',
    up: (db) => {
      addColumn(db, 'characters', 'units', 'INTEGER NOT NULL DEFAULT 0 CHECK(units>=0)');
      addColumn(db, 'characters', 'color', 'TEXT');
      addColumn(db, 'characters', 'description', 'TEXT');
      db.exec(`
CREATE TABLE IF NOT EXISTS pool_units(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES campaigns(id),position INTEGER NOT NULL CHECK(position>=0),character_id TEXT NOT NULL REFERENCES characters(id),allocated INTEGER NOT NULL DEFAULT 0 CHECK(allocated IN (0,1)),created_at INTEGER NOT NULL,UNIQUE(campaign_id,position));
CREATE INDEX IF NOT EXISTS pool_units_next ON pool_units(campaign_id,allocated,position);
CREATE TABLE IF NOT EXISTS fairness_commitments(campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id),commitment_hex TEXT NOT NULL CHECK(length(commitment_hex)=64),seed_hex TEXT NOT NULL CHECK(length(seed_hex)=64),committed_at INTEGER NOT NULL,revealed_at INTEGER,created_at INTEGER NOT NULL);`);
      addColumn(db, 'allocations', 'pool_unit_id', 'TEXT REFERENCES pool_units(id)');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS allocations_pool_unit ON allocations(pool_unit_id)');
      createGuards(db, [
        'pool_units_fixed',
        'pool_units_no_unallocate',
        'pool_units_no_delete',
        'commitment_fixed',
        'commitment_no_delete',
      ]);
      // v1 allocations were weighted-random demo data (every v1 order is DEMO_PAID) and cannot be
      // mapped onto a shuffle published before they were sold. Wipe them; seed() rebuilds the
      // demo drop with a committed pool. Any real order blocks this and requires a manual reset.
      const legacy = db
        .prepare('SELECT COUNT(*) AS n FROM allocations WHERE pool_unit_id IS NULL')
        .get() as { n: number };
      if (legacy.n > 0) {
        const real = db
          .prepare("SELECT COUNT(*) AS n FROM orders WHERE status<>'DEMO_PAID'")
          .get() as { n: number };
        if (real.n > 0)
          throw new Error(
            'This database has allocations made before the fairness upgrade. Stop the server and run `npm run reset:demo`.',
          );
        console.warn('LoopBox: replacing v1 demo data with the committed-shuffle demo drop.');
        wipeAll(db);
      }
    },
  },
];

export function migrate(db: DatabaseSync) {
  const version = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version() >= migrations[migrations.length - 1].id) return;
  // Table rebuilds need foreign keys off; they are re-checked before each commit.
  db.exec('PRAGMA foreign_keys=OFF');
  try {
    for (const m of migrations) {
      db.exec('BEGIN IMMEDIATE');
      try {
        // Re-read inside the lock so two processes opening the same file never double-apply.
        if (version() >= m.id) {
          db.exec('COMMIT');
          continue;
        }
        m.up(db);
        if (db.prepare('PRAGMA foreign_key_check').all().length)
          throw new Error(`Migration ${m.id} (${m.name}) left broken foreign keys`);
        db.exec(`PRAGMA user_version=${m.id}`);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
}
