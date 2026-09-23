import type { DatabaseSync } from 'node:sqlite';
import { seedMarketDemo, seedPartnerDemo } from './demo-data';

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
  if (!hasColumn(db, table, column))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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
  [
    'c2c_draws_no_update',
    "CREATE TRIGGER IF NOT EXISTS c2c_draws_no_update BEFORE UPDATE ON c2c_draws BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;",
  ],
  [
    'c2c_draws_no_delete',
    "CREATE TRIGGER IF NOT EXISTS c2c_draws_no_delete BEFORE DELETE ON c2c_draws BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;",
  ],
  [
    'audit_no_update',
    "CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;",
  ],
  [
    'audit_no_delete',
    "CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;",
  ],
];
const createGuards = (db: DatabaseSync, names: string[]) =>
  guardTriggers.filter(([name]) => names.includes(name)).forEach(([, sql]) => db.exec(sql));

/** Removes every row from every table (demo reset). Caller must have foreign keys off. */
export function wipeAll(db: DatabaseSync) {
  const present = new Set(
    (
      db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as { name: string }[]
    ).map((t) => t.name),
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
      addColumn(
        db,
        'campaigns',
        'required_score',
        'INTEGER NOT NULL DEFAULT 10 CHECK(required_score BETWEEN 1 AND 15)',
      );
      addColumn(
        db,
        'campaigns',
        'attempts_per_day',
        'INTEGER NOT NULL DEFAULT 5 CHECK(attempts_per_day BETWEEN 1 AND 20)',
      );
      addColumn(
        db,
        'campaigns',
        'game_mode',
        "TEXT NOT NULL DEFAULT 'run' CHECK(game_mode IN ('run','lore'))",
      );
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
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS allocations_pool_unit ON allocations(pool_unit_id)',
      );
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
  {
    id: 4,
    name: 'M5 Stripe payments, webhook dedupe and audit log',
    up: (db) => {
      // Rebuild orders to add a status CHECK. Same 7 columns in the same order.
      db.exec(`
DROP TRIGGER IF EXISTS capacity_guard;
CREATE TABLE orders_v4(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),campaign_id TEXT NOT NULL REFERENCES campaigns(id),access_id TEXT UNIQUE REFERENCES access(id),amount INTEGER NOT NULL CHECK(amount>0),status TEXT NOT NULL DEFAULT 'DEMO_PAID' CHECK(status IN ('PENDING_PAYMENT','PAID','DEMO_PAID','EXPIRED','REFUNDED')),created_at INTEGER NOT NULL);
INSERT INTO orders_v4 SELECT id,user_id,campaign_id,access_id,amount,status,created_at FROM orders;
DROP TABLE orders;
ALTER TABLE orders_v4 RENAME TO orders;
CREATE INDEX IF NOT EXISTS orders_campaign ON orders(campaign_id,user_id);
CREATE INDEX IF NOT EXISTS orders_status ON orders(campaign_id,status);
CREATE TRIGGER capacity_guard BEFORE INSERT ON orders WHEN NEW.status IN ('PENDING_PAYMENT','PAID','DEMO_PAID') BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM orders WHERE campaign_id=NEW.campaign_id AND status IN ('PENDING_PAYMENT','PAID','DEMO_PAID'))>=(SELECT capacity FROM campaigns WHERE id=NEW.campaign_id) THEN RAISE(ABORT,'SOLD_OUT') END; END;
CREATE TRIGGER capacity_guard_revive BEFORE UPDATE OF status ON orders WHEN NEW.status IN ('PENDING_PAYMENT','PAID','DEMO_PAID') AND OLD.status NOT IN ('PENDING_PAYMENT','PAID','DEMO_PAID') BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM orders WHERE campaign_id=NEW.campaign_id AND status IN ('PENDING_PAYMENT','PAID','DEMO_PAID'))>=(SELECT capacity FROM campaigns WHERE id=NEW.campaign_id) THEN RAISE(ABORT,'SOLD_OUT') END; END;
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('B2C','C2C')),ref_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),stripe_session_id TEXT UNIQUE,payment_intent TEXT,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),status TEXT NOT NULL CHECK(status IN ('OPEN','PAID','EXPIRED','FAILED','REFUNDED','SIMULATED')),expires_at INTEGER NOT NULL,paid_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS payments_ref ON payments(kind,ref_id);
CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,type TEXT NOT NULL,received_at INTEGER NOT NULL,processed_at INTEGER);
CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '{}',created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS audit_entity ON audit_log(entity,created_at);`);
      addColumn(db, 'access', 'order_id', 'TEXT REFERENCES orders(id)');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS access_order ON access(order_id)');
      addColumn(db, 'users', 'age_confirmed_at', 'INTEGER');
      createGuards(db, ['audit_no_update', 'audit_no_delete']);
    },
  },
  {
    id: 5,
    name: 'M6 admin role, partners, campaign lifecycle phases',
    up: (db) => {
      const now = Date.now();
      // Triggers that reference campaigns must not exist while the table is rebuilt.
      db.exec(`
DROP TRIGGER IF EXISTS capacity_guard;
DROP TRIGGER IF EXISTS capacity_guard_revive;
CREATE TABLE users_v5(id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),role TEXT NOT NULL CHECK(role IN ('COLLECTOR','BUSINESS','ADMIN')),created_at INTEGER NOT NULL,email TEXT UNIQUE,email_verified_at INTEGER,phone TEXT,phone_verified_at INTEGER,age_confirmed_at INTEGER,trust_score INTEGER NOT NULL DEFAULT 100 CHECK(trust_score BETWEEN 0 AND 100));
INSERT INTO users_v5 (id,name,role,created_at,age_confirmed_at) SELECT id,name,role,created_at,age_confirmed_at FROM users;
DROP TABLE users;
ALTER TABLE users_v5 RENAME TO users;
CREATE TABLE IF NOT EXISTS partners(id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),type TEXT NOT NULL CHECK(type IN ('BRAND','COLLECTIVE')),owner_user_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS partner_members(partner_id TEXT NOT NULL REFERENCES partners(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('OWNER','MEMBER')),created_at INTEGER NOT NULL,PRIMARY KEY(partner_id,user_id));
CREATE INDEX IF NOT EXISTS partner_members_user ON partner_members(user_id);
CREATE TABLE campaigns_v5(id TEXT PRIMARY KEY,business_id TEXT REFERENCES businesses(id),partner_id TEXT REFERENCES partners(id),name TEXT NOT NULL,description TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),capacity INTEGER NOT NULL CHECK(capacity>0),max_per_user INTEGER NOT NULL CHECK(max_per_user>0),phase TEXT NOT NULL CHECK(phase IN ('DRAFT','IN_REVIEW','UPCOMING','ACTIVE_PREORDER','PREORDER_CLOSED','TRADE_WINDOW','ALLOCATION_LOCKED','IN_PRODUCTION','SHIPPING','COMPLETED','CANCELLED')),starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,trade_ends_at INTEGER NOT NULL,required_score INTEGER NOT NULL DEFAULT 10 CHECK(required_score BETWEEN 1 AND 15),attempts_per_day INTEGER NOT NULL DEFAULT 5 CHECK(attempts_per_day BETWEEN 1 AND 20),game_mode TEXT NOT NULL DEFAULT 'run' CHECK(game_mode IN ('run','lore')),revenue_share_bps INTEGER NOT NULL DEFAULT 3000 CHECK(revenue_share_bps BETWEEN 0 AND 10000),created_at INTEGER NOT NULL DEFAULT 0);
INSERT INTO campaigns_v5 (id,business_id,name,description,price,capacity,max_per_user,phase,starts_at,ends_at,trade_ends_at,required_score,attempts_per_day,game_mode) SELECT id,business_id,name,description,price,capacity,max_per_user,phase,starts_at,ends_at,trade_ends_at,required_score,attempts_per_day,game_mode FROM campaigns;
DROP TABLE campaigns;
ALTER TABLE campaigns_v5 RENAME TO campaigns;
CREATE TRIGGER capacity_guard BEFORE INSERT ON orders WHEN NEW.status IN ('PENDING_PAYMENT','PAID','DEMO_PAID') BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM orders WHERE campaign_id=NEW.campaign_id AND status IN ('PENDING_PAYMENT','PAID','DEMO_PAID'))>=(SELECT capacity FROM campaigns WHERE id=NEW.campaign_id) THEN RAISE(ABORT,'SOLD_OUT') END; END;
CREATE TRIGGER capacity_guard_revive BEFORE UPDATE OF status ON orders WHEN NEW.status IN ('PENDING_PAYMENT','PAID','DEMO_PAID') AND OLD.status NOT IN ('PENDING_PAYMENT','PAID','DEMO_PAID') BEGIN SELECT CASE WHEN (SELECT COUNT(*) FROM orders WHERE campaign_id=NEW.campaign_id AND status IN ('PENDING_PAYMENT','PAID','DEMO_PAID'))>=(SELECT capacity FROM campaigns WHERE id=NEW.campaign_id) THEN RAISE(ABORT,'SOLD_OUT') END; END;`);
      // Each v1 business becomes a Brand partner owned by its business user.
      const owner = db
        .prepare("SELECT id FROM users WHERE role='BUSINESS' ORDER BY created_at,id LIMIT 1")
        .get() as { id: string } | undefined;
      if (owner)
        for (const b of db.prepare('SELECT id,name FROM businesses').all() as {
          id: string;
          name: string;
        }[]) {
          db.prepare(
            'INSERT OR IGNORE INTO partners (id,name,type,owner_user_id,created_at) VALUES (?,?,?,?,?)',
          ).run(b.id, b.name, 'BRAND', owner.id, now);
          db.prepare(
            'INSERT OR IGNORE INTO partner_members (partner_id,user_id,role,created_at) VALUES (?,?,?,?)',
          ).run(b.id, owner.id, 'OWNER', now);
          db.prepare('UPDATE campaigns SET partner_id=? WHERE business_id=?').run(b.id, b.id);
        }
      if (db.prepare("SELECT 1 FROM users WHERE id='collector'").get())
        db.prepare(
          "INSERT OR IGNORE INTO users (id,name,role,created_at) VALUES ('admin','Admin','ADMIN',?)",
        ).run(now);
    },
  },
  {
    id: 6,
    name: 'Accounts: password sign-in, lockout, hashed session tokens',
    up: (db) => {
      addColumn(db, 'users', 'password_hash', 'TEXT');
      addColumn(db, 'users', 'failed_logins', 'INTEGER NOT NULL DEFAULT 0');
      addColumn(db, 'users', 'locked_until', 'INTEGER');
      addColumn(db, 'sessions', 'created_at', 'INTEGER NOT NULL DEFAULT 0');
      // Tokens used to be stored as-is. They are now stored as SHA-256 hashes, so old rows
      // can never match again: sign everyone out once.
      db.exec(
        'DELETE FROM sessions; CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);',
      );
    },
  },
  {
    id: 7,
    name: 'M7 partner applications',
    up: (db) => {
      db.exec(`
CREATE TABLE IF NOT EXISTS partner_applications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL CHECK(type IN ('BRAND','COLLECTIVE')),org_name TEXT NOT NULL CHECK(length(org_name) BETWEEN 2 AND 80),contact_email TEXT NOT NULL,website TEXT,proof_url TEXT,portfolio_url TEXT,members_count INTEGER CHECK(members_count IS NULL OR members_count BETWEEN 2 AND 500),proposed_series TEXT NOT NULL,ip_statement TEXT NOT NULL CHECK(length(ip_statement)>=20),status TEXT NOT NULL CHECK(status IN ('SUBMITTED','APPROVED','REJECTED','INFO_REQUESTED')),admin_note TEXT,partner_id TEXT REFERENCES partners(id),created_at INTEGER NOT NULL,decided_at INTEGER);
CREATE INDEX IF NOT EXISTS partner_applications_user ON partner_applications(user_id,status);`);
      if (db.prepare("SELECT 1 FROM users WHERE id='collector'").get())
        seedPartnerDemo(db, Date.now());
    },
  },
  {
    id: 8,
    name: 'M8 creator marketplace',
    up: (db) => {
      db.exec(`
CREATE TABLE IF NOT EXISTS otp_codes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),channel TEXT NOT NULL CHECK(channel IN ('EMAIL','PHONE')),target TEXT NOT NULL,code_hash TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),expires_at INTEGER NOT NULL,consumed_at INTEGER,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS otp_user ON otp_codes(user_id,channel,created_at);
CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL CHECK(length(title) BETWEEN 4 AND 80),theme TEXT NOT NULL CHECK(length(theme) BETWEEN 2 AND 30),description TEXT NOT NULL CHECK(length(description) <= 1000),price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 100 AND 100000),fulfilment TEXT NOT NULL CHECK(fulfilment IN ('SHIP','MEETUP','BOTH')),status TEXT NOT NULL CHECK(status IN ('DRAFT','ACTIVE','SOLD_OUT','PAUSED','SUSPENDED')),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS listings_status ON listings(status,created_at);
CREATE INDEX IF NOT EXISTS listings_seller ON listings(seller_id);
CREATE TABLE IF NOT EXISTS listing_characters(id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id),position INTEGER NOT NULL,name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 40),rarity TEXT NOT NULL CHECK(rarity IN ('COMMON','RARE','SECRET')),color TEXT,declared INTEGER NOT NULL CHECK(declared BETWEEN 1 AND 500),remaining INTEGER NOT NULL CHECK(remaining>=0 AND remaining<=declared),image_path TEXT,UNIQUE(listing_id,position));
CREATE TABLE IF NOT EXISTS listing_photos(id TEXT PRIMARY KEY,listing_id TEXT REFERENCES listings(id),uploader_id TEXT NOT NULL REFERENCES users(id),path TEXT NOT NULL,mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 2097152),created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS listing_photos_listing ON listing_photos(listing_id);
CREATE TABLE IF NOT EXISTS market_orders(id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id),buyer_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES users(id),quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents>0),fee_cents INTEGER NOT NULL CHECK(fee_cents>=0),seller_owed_cents INTEGER NOT NULL CHECK(seller_owed_cents>=0),status TEXT NOT NULL CHECK(status IN ('PENDING_PAYMENT','PAID_HELD','FULFILLED','COMPLETED','REPORTED','RESOLVED','REFUNDED','EXPIRED')),payout_status TEXT NOT NULL CHECK(payout_status IN ('NONE','HELD','OWED','VOID')),fulfilment_note TEXT,created_at INTEGER NOT NULL,paid_at INTEGER,fulfilled_at INTEGER,completed_at INTEGER,CHECK(buyer_id<>seller_id),CHECK(subtotal_cents = fee_cents + seller_owed_cents));
CREATE INDEX IF NOT EXISTS market_orders_buyer ON market_orders(buyer_id,created_at);
CREATE INDEX IF NOT EXISTS market_orders_seller ON market_orders(seller_id,created_at);
CREATE TABLE IF NOT EXISTS c2c_draws(id TEXT PRIMARY KEY,market_order_id TEXT NOT NULL REFERENCES market_orders(id),box_index INTEGER NOT NULL CHECK(box_index>=1),listing_character_id TEXT NOT NULL REFERENCES listing_characters(id),random_value INTEGER NOT NULL,total INTEGER NOT NULL,stock_snapshot TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(market_order_id,box_index));
CREATE TABLE IF NOT EXISTS chat_threads(id TEXT PRIMARY KEY,market_order_id TEXT NOT NULL UNIQUE REFERENCES market_orders(id),buyer_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chat_messages(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL REFERENCES chat_threads(id),sender_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS chat_messages_thread ON chat_messages(thread_id,created_at);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,market_order_id TEXT NOT NULL REFERENCES market_orders(id),reporter_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL CHECK(reason IN ('WRONG_ITEM','MISSING_ITEM','NOT_DELIVERED','OTHER')),details TEXT,status TEXT NOT NULL CHECK(status IN ('OPEN','UPHELD','DISMISSED')),created_at INTEGER NOT NULL,resolved_at INTEGER);`);
      createGuards(db, ['c2c_draws_no_update', 'c2c_draws_no_delete']);
      if (db.prepare("SELECT 1 FROM users WHERE id='collector'").get())
        seedMarketDemo(db, Date.now());
    },
  },
];

export function migrate(db: DatabaseSync) {
  const version = () =>
    (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
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
