// Runs the browser tests against the packaged release (release/loopbox-*/start.mjs) instead of
// `next start`, to prove the download works: npx playwright test -c playwright.release.config.ts
import { defineConfig } from '@playwright/test';
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import base from './playwright.config';

const dir = readdirSync('release', { withFileTypes: true }).find(
  (d) => d.isDirectory() && d.name.startsWith('loopbox-'),
)?.name;
if (!dir) throw new Error('No packaged release. Run: node scripts/package-release.mjs');
// Start from a freshly seeded demo, exactly as a new download would.
rmSync(join('release', dir, 'data'), { recursive: true, force: true });

export default defineConfig({
  ...base,
  webServer: {
    command: `node ${join('release', dir, 'start.mjs')}`,
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: '3100',
      HOSTNAME: '127.0.0.1',
      DEMO_MODE: 'true',
      SIMULATE_PAYMENTS: 'true',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      RATE_LIMIT_SCALE: '50',
    },
  },
});
