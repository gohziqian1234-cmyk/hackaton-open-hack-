// Deletes the local demo database so the next request reseeds a fresh 93 / 100 drop.
// Stop the server first. Usage: npm run reset:demo
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const db = resolve(process.env.LOOPBOX_DB || 'data/loopbox.sqlite');
for (const file of [db, db + '-wal', db + '-shm']) {
  rmSync(file, { force: true });
  console.log('removed', file);
}
console.log('Demo data reset. Start the app and it will reseed on the first request.');
