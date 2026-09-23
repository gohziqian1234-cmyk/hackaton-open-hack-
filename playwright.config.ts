import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
// PW_CHROMIUM_PATH lets machines without Google Chrome (CI containers) use a local Chromium build.
const chromium = process.env.PW_CHROMIUM_PATH;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    ...(chromium ? { launchOptions: { executablePath: chromium } } : { channel: 'chrome' }),
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      LOOPBOX_DB: resolve('data/e2e.sqlite'),
      DEMO_MODE: 'true',
      // e2e always uses the simulated payment path, even if a developer has Stripe keys.
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      SIMULATE_PAYMENTS: 'true',
    },
  },
});
