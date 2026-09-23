// Creates (or resets the password of) a real ADMIN account for a production deployment.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long passphrase' ADMIN_NAME='Ops' \
//        npm run create-admin
// Stop nothing: safe to run while the server is up (SQLite serialises the write).
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { hashPassword } from '../src/server/password.ts';

const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? '';
const name = (process.env.ADMIN_NAME ?? 'Admin').trim().slice(0, 60) || 'Admin';
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Set ADMIN_EMAIL to a valid email address.');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Set ADMIN_PASSWORD to at least 12 characters.');
  process.exit(1);
}
const db = new DatabaseSync(resolve(process.env.LOOPBOX_DB || 'data/loopbox.sqlite'));
db.exec('PRAGMA busy_timeout=5000');
const hasColumn = db
  .prepare('PRAGMA table_info(users)')
  .all()
  .some((c) => c.name === 'password_hash');
if (!hasColumn) {
  console.error('Start the app once so the database is created and migrated, then run this again.');
  process.exit(1);
}
const now = Date.now();
const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
if (existing) {
  db.prepare("UPDATE users SET role='ADMIN',password_hash=?,failed_logins=0,locked_until=NULL WHERE id=?").run(
    hashPassword(password),
    existing.id,
  );
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
  console.log(`Updated ${email}: role ADMIN, new password, all sessions signed out.`);
} else {
  db.prepare(
    "INSERT INTO users (id,name,role,created_at,email,email_verified_at,password_hash) VALUES (?,?,'ADMIN',?,?,?,?)",
  ).run(randomUUID(), name, now, email, now, hashPassword(password));
  console.log(`Created ADMIN ${email}.`);
}
db.close();
