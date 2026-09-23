// Starts the production server. Binds to HOSTNAME (default 127.0.0.1) and PORT (default 3000).
// On a public host set HOSTNAME=0.0.0.0.
import { spawn } from 'node:child_process';
import { checkEnv } from './check-env.mjs';

// Refuse to start with a dangerous configuration (live Stripe keys, secrets in NEXT_PUBLIC_*, …).
const { errors, warnings } = checkEnv();
for (const w of warnings) console.warn('LoopBox config warning:', w);
for (const e of errors) console.error('LoopBox config error:', e);
if (errors.length) process.exit(1);

const hostname = process.env.HOSTNAME || '127.0.0.1';
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', hostname, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
