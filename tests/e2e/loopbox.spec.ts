import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDatabase, seed } from '../../src/server/db';
import { DomainError, Loopbox } from '../../src/server/service';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const screenshotDir = resolve('../../work/qa');
test.beforeEach(() => {
  mkdirSync(screenshotDir, { recursive: true });
  const db = createDatabase('data/e2e.sqlite');
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
  for (const table of [
    'waitlist',
    'matches',
    'preferences',
    'allocations',
    'orders',
    'access',
    'game_sessions',
    'sessions',
    'characters',
    'campaigns',
    'users',
    'businesses',
  ])
    db.exec(`DELETE FROM ${table}`);
  db.exec('COMMIT; PRAGMA foreign_keys=ON;');
  seed(db);
  db.close();
});
async function login(page: Page, user = 'collector') {
  const r = await page.request.post('/api/loopbox', {
    headers: { Origin: 'http://127.0.0.1:3100' },
    data: { action: 'login', user },
  });
  expect(r.ok()).toBeTruthy();
}
async function snapshot(page: Page) {
  return (await page.request.get('/api/loopbox')).json();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
}
test('golden path: quest, preorder, reveal, direct trade, final production', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /A little mystery/ })).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '01-home.png'), fullPage: true });
  await page.getByRole('link', { name: 'Explore the drop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Astral Kin™' })).toBeVisible();
  await expect(page.getByText('7 remaining', { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '02-drop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Play to unlock' }).click();
  await page.getByRole('button', { name: /Untimed lore challenge/ }).click();
  await page.getByRole('button', { name: 'Start lore challenge' }).click();
  await page.getByRole('button', { name: /After orders and trades are final/ }).click();
  await page.getByRole('button', { name: /Rare for rare/ }).click();
  await page.getByRole('button', { name: /Access to one blind-box preorder/ }).click();
  await expect(page.getByRole('heading', { name: 'Quest cleared.' })).toBeVisible();
  await page.getByRole('link', { name: 'Claim preorder slot' }).click();
  await page.getByRole('checkbox').check();
  await page.screenshot({ path: resolve(screenshotDir, '03-checkout.png'), fullPage: true });
  await page.getByRole('button', { name: 'Confirm demo preorder' }).click();
  await page.getByRole('button', { name: 'Open my box' }).click();
  await expect(page.getByRole('heading', { name: 'Eclipse Knight' })).toBeVisible();
  await expect(page.getByText(/You have a duplicate/)).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '04-reveal.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save card' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('loopbox-my-astral-kin.png');
  await page.getByRole('link', { name: 'Find a trade', exact: true }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Find my match' }).click();
  await expect(page.getByRole('heading', { name: 'Two kin. Two happy collectors.' })).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '05-match.png'), fullPage: true });
  await page.getByRole('button', { name: 'Accept exchange' }).click();
  await expect(page.getByText('Exchange complete.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'See my updated collection' }).click();
  await expect(page.getByRole('heading', { name: 'Aurora Warden' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Aurora Warden' })).toBeVisible();
  expect((await snapshot(page)).campaign.confirmed).toBe(94);
  await page.screenshot({ path: resolve(screenshotDir, '06-collection.png'), fullPage: true });
  await page.getByRole('button', { name: /Demo collector/ }).click();
  await expect(page.getByRole('heading', { name: 'Demand, before making.' })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Advance campaign' }).click();
    await page.getByRole('button', { name: 'Confirm phase change' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Ready to make.' })).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '07-studio.png'), fullPage: true });
  await page.goto('/verify/astral');
  await expect(page.getByText('Fingerprints match')).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '08-verify.png'), fullPage: true });
  const analytics = await (await page.request.get('/api/loopbox?analytics=1')).json();
  expect(analytics.orders).toBe(94);
  expect(analytics.trades).toBe(1);
  expect(
    analytics.distribution.reduce((n: number, d: { quantity: number }) => n + d.quantity, 0),
  ).toBe(94);
  await noOverflow(page);
  expect(errors).toEqual([]);
});
test('keyboard fragment run earns access and pause works', async ({ page }) => {
  await login(page);
  await page.goto('/quest');
  await page.getByRole('button', { name: 'Start quest', exact: true }).click();
  await expect(page.locator('.countdown')).toBeVisible();
  await page.getByRole('button', { name: 'Pause quest' }).click();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  // Follow the rendered fragment by pressing real keyboard controls; no completion API shortcut.
  let current = 1;
  const end = Date.now() + 43000;
  while (Date.now() < end) {
    if (await page.getByRole('heading', { name: 'Quest cleared.' }).isVisible()) break;
    const fragment = page.locator('.fragment');
    if (await fragment.count()) {
      const left = await fragment.evaluate((el) => (el as HTMLElement).style.left);
      const target = Math.round((parseFloat(left) - 18) / 32);
      while (current < target) {
        await page.keyboard.press('ArrowRight');
        current++;
      }
      while (current > target) {
        await page.keyboard.press('ArrowLeft');
        current--;
      }
    }
    await page.waitForTimeout(100);
  }
  await expect(page.getByRole('heading', { name: 'Quest cleared.' })).toBeVisible();
  expect((await snapshot(page)).access).toHaveLength(1);
  await page.screenshot({ path: resolve(screenshotDir, '08-quest-win.png'), fullPage: true });
});
test('mobile layout, accessible controls, reduced motion and WebGL fallback', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await login(page);
  for (const route of ['/', '/drop', '/quest', '/collection', '/trades']) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: resolve(screenshotDir, 'mobile-' + (route === '/' ? 'home' : route.slice(1)) + '.png'),
      fullPage: true,
    });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Eclipse Knight collectible' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('link', { name: 'Trade room' })).toBeVisible();
});
test('API boundaries, concurrent last-unit purchases, replay and role guards', async ({ page }) => {
  await login(page);
  const origin = { Origin: 'http://127.0.0.1:3100' };
  expect(
    (
      await page.request.post('/api/loopbox', {
        headers: { Origin: 'https://foreign.invalid' },
        data: { action: 'advance' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/loopbox', { headers: origin, data: { action: 'advance' } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/loopbox', {
        headers: origin,
        data: { action: 'complete', sessionId: 'fake', values: [999999] },
      })
    ).status(),
  ).toBe(400);
  const db = createDatabase('data/e2e.sqlite');
  db.prepare('UPDATE campaigns SET capacity=94,max_per_user=20').run();
  db.close();
  const contexts = [];
  for (const user of ['collector', 'demo-0']) {
    const context = await page
      .context()
      .browser()!
      .newContext({ baseURL: 'http://127.0.0.1:3100' });
    await context.request.post('/api/loopbox', {
      headers: origin,
      data: { action: 'login', user },
    });
    const g = await (
      await context.request.post('/api/loopbox', {
        headers: origin,
        data: { action: 'start', mode: 'lore' },
      })
    ).json();
    const won = await (
      await context.request.post('/api/loopbox', {
        headers: origin,
        data: { action: 'complete', sessionId: g.id, values: [1, 0, 2] },
      })
    ).json();
    contexts.push({ context, accessId: won.accessId });
  }
  const results = await Promise.all(
    contexts.map(({ context, accessId }) =>
      context.request.post('/api/loopbox', {
        headers: origin,
        data: { action: 'preorder', accessId },
      }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  expect((await snapshot(page)).campaign.confirmed).toBe(94);
  await Promise.all(contexts.map((c) => c.context.close()));
  await page.goto('/drop');
  await expect(page.getByRole('button', { name: 'Sold out · Join waitlist' })).toBeVisible();
  await page.getByRole('button', { name: 'Sold out · Join waitlist' }).click();
  await expect(page.getByRole('button', { name: 'You’re on the waitlist' })).toBeDisabled();
});

test('studio settings keep edited allocation weights on reopening', async ({ page }) => {
  await login(page, 'business');
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Edit campaign' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[name="nova"]').fill('23');
  await dialog.locator('input[name="price"]').fill('19.50');
  await dialog.getByRole('button', { name: 'Save campaign' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Edit campaign' }).click();
  await expect(dialog.locator('input[name="nova"]')).toHaveValue('23');
  await expect(dialog.locator('input[name="price"]')).toHaveValue('19.5');
});

test('committed pool: 50 concurrent purchases across two processes for the last 3 boxes', async ({
  page,
}) => {
  await login(page);
  const origin = { Origin: 'http://127.0.0.1:3100' };
  const db = createDatabase('data/e2e.sqlite');
  db.exec(`UPDATE campaigns SET max_per_user=60;
    UPDATE pool_units SET allocated=1 WHERE campaign_id='astral' AND position BETWEEN 93 AND 96;`);
  const now = Date.now();
  const insert = db.prepare(
    'INSERT INTO access (id,user_id,campaign_id,earned_at,expires_at,status) VALUES (?,?,?,?,?,?)',
  );
  const ids = Array.from({ length: 50 }, (_, i) => {
    insert.run('race-' + i, 'collector', 'astral', now, now + 600000, 'AVAILABLE');
    return 'race-' + i;
  });
  // 45 purchases go through the web server process while this test process buys 5 directly
  // on its own database connection at the same moment.
  const http = Promise.all(
    ids.slice(0, 45).map((accessId) =>
      page.request.post('/api/loopbox', { headers: origin, data: { action: 'preorder', accessId } }),
    ),
  );
  const direct = new Loopbox(db, () => Date.now(), true);
  const directWins = ids.slice(45).filter((accessId) => {
    try {
      direct.preorder('collector', accessId);
      return true;
    } catch (e) {
      if (e instanceof DomainError && e.code === 'SOLD_OUT') return false;
      throw e;
    }
  }).length;
  const statuses = (await http).map((r) => r.status());
  expect(statuses.filter((s) => s !== 200 && s !== 409)).toEqual([]);
  expect(statuses.filter((s) => s === 200).length + directWins).toBe(3);
  const units = db
    .prepare("SELECT pool_unit_id FROM allocations WHERE campaign_id='astral'")
    .all() as { pool_unit_id: string }[];
  expect(units).toHaveLength(96);
  expect(new Set(units.map((u) => u.pool_unit_id)).size).toBe(96);
  db.close();
});
