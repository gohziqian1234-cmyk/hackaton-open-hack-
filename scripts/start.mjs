// Starts the production server. Binds to HOSTNAME (default 127.0.0.1) and PORT (default 3000).
// On a public host set HOSTNAME=0.0.0.0.
import { spawn } from 'node:child_process';

const hostname = process.env.HOSTNAME || '127.0.0.1';
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', hostname, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
