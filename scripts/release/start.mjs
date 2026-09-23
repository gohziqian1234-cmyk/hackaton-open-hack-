// Starts the downloaded LoopBox release: `node start.mjs` (or double-click start-windows.cmd /
// run ./start-mac-linux.sh). Needs Node.js 22.13 or newer (24 recommended).
// Data is kept in ./data next to this file.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
process.chdir(here);

// node:sqlite works without flags from Node 22.13; tested on 22.22 and 24.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    `LoopBox needs Node.js 22.13 or newer (24 recommended); this computer has ${process.versions.node}.\n` +
      'Install the current version from https://nodejs.org and run this again.',
  );
  process.exit(1);
}

// Optional settings file next to this script (copy .env.example to .env and edit it).
if (existsSync(join(here, '.env'))) process.loadEnvFile(join(here, '.env'));

// Safe defaults for a laptop demo: only this computer can open it, demo mode with simulated payments.
const defaults = {
  HOSTNAME: '127.0.0.1',
  PORT: '3000',
  DEMO_MODE: 'true',
  SIMULATE_PAYMENTS: 'true',
  LOOPBOX_DB: join(here, 'data', 'loopbox.sqlite'),
};
for (const [key, value] of Object.entries(defaults))
  if (!process.env[key]) process.env[key] = value;
process.env.NODE_ENV = 'production';

const { checkEnv } = await import('./check-env.mjs');
const { errors, warnings } = checkEnv();
for (const w of warnings) console.warn('LoopBox config warning:', w);
for (const e of errors) console.error('LoopBox config error:', e);
if (errors.length) process.exit(1);

const shown = process.env.HOSTNAME === '0.0.0.0' ? 'localhost' : process.env.HOSTNAME;
console.log(`\nLoopBox is starting. Open http://${shown}:${process.env.PORT} in your browser.`);
console.log('Press Ctrl+C to stop. Delete the "data" folder to reset the demo.\n');
await import('./server.js');
