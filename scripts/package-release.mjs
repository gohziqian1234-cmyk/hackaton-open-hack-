// Packages a ready-to-run LoopBox download for a GitHub Release.
// Run after `LOOPBOX_STANDALONE=true npm run build`. Output: release/loopbox-<version>.zip and .tar.gz.
// Only an explicit list of files is copied, so local databases, uploads, .env files and git history
// can never end up in a download.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const standalone = join(root, '.next', 'standalone');
if (!existsSync(join(standalone, 'server.js'))) {
  console.error('No standalone build found. Run: LOOPBOX_STANDALONE=true npm run build');
  process.exit(1);
}
const version =
  process.env.RELEASE_VERSION ||
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const name = `loopbox-${version}`;
const out = join(root, 'release');
const app = join(out, name);
rmSync(out, { recursive: true, force: true });
mkdirSync(app, { recursive: true });

// 1. The self-contained server: server.js, its package.json, traced runtime modules, compiled app.
cpSync(join(standalone, 'server.js'), join(app, 'server.js'));
cpSync(join(standalone, 'package.json'), join(app, 'package.json'));
cpSync(join(standalone, 'node_modules'), join(app, 'node_modules'), {
  recursive: true,
  // sharp only serves next/image, which LoopBox doesn't use; its binaries are OS-specific.
  filter: (src) => !/[\\/]node_modules[\\/](sharp|@img)([\\/]|$)/.test(src),
});
cpSync(join(standalone, '.next'), join(app, '.next'), {
  recursive: true,
  filter: (src) => !/[\\/]\.next[\\/]cache([\\/]|$)/.test(src),
});
// 2. Browser assets (not included in standalone by design).
cpSync(join(root, '.next', 'static'), join(app, '.next', 'static'), { recursive: true });
if (existsSync(join(root, 'public')))
  cpSync(join(root, 'public'), join(app, 'public'), { recursive: true });
// 3. Launcher, config check and docs.
cpSync(join(root, 'scripts', 'check-env.mjs'), join(app, 'check-env.mjs'));
cpSync(join(root, 'scripts', 'release', 'start.mjs'), join(app, 'start.mjs'));
cpSync(join(root, 'scripts', 'release', 'start-windows.cmd'), join(app, 'start-windows.cmd'));
cpSync(join(root, 'scripts', 'release', 'start-mac-linux.sh'), join(app, 'start-mac-linux.sh'));
cpSync(join(root, 'scripts', 'release', 'HOW-TO-RUN.txt'), join(app, 'HOW-TO-RUN.txt'));
cpSync(join(root, '.env.example'), join(app, '.env.example'));
for (const doc of ['README.md', 'DEMO.md']) cpSync(join(root, doc), join(app, doc));

// Safety net: nothing private may be inside.
const forbidden = ['data', '.git', '.env', '.env.local', 'tests', 'src', 'work'];
for (const f of forbidden)
  if (existsSync(join(app, f))) throw new Error(`Refusing to package: ${f} is inside the release`);

chmodSync(join(app, 'start-mac-linux.sh'), 0o755);
execFileSync('tar', ['-czf', `${name}.tar.gz`, name], { cwd: out });
execFileSync('zip', ['-qry', `${name}.zip`, name], { cwd: out });
console.log(`Packaged release/${name}.zip and release/${name}.tar.gz`);
