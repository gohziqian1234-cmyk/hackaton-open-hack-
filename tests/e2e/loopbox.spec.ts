import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDatabase, seed } from '../../src/server/db';
import { DomainError, Loopbox } from '../../src/server/service';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
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
  await expect(page.getByRole('heading', { name: /Collect the surprise/ })).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '01-home.png'), fullPage: true });
  await page.getByRole('link', { name: 'Explore the drops', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drops', exact: true })).toBeVisible();
  await page.locator('a[href="/drops/astral-kin"]').first().click();
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
  // v2: open first (the server draws before the animation), pay at checkout afterwards.
  await page.getByRole('button', { name: 'Open my box' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { name: 'Eclipse Knight' })).toBeVisible();
  await expect(page.getByText(/You have a duplicate/)).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '04-reveal.png'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save card' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('loopbox-my-astral-kin.png');
  await page.getByRole('link', { name: 'Keep it — go to checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check();
  await page.screenshot({ path: resolve(screenshotDir, '03-checkout.png'), fullPage: true });
  await page.getByRole('button', { name: 'Checkout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Are you sure you want these made?' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'I understand these figures will be made just for me.' }).check();
  await page.getByRole('button', { name: 'Yes, confirm & pay' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmed. You’re on the production list.' })).toBeVisible();
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
  const manifestDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download manifest' }).click();
  const manifest = await manifestDownload;
  expect(manifest.suggestedFilename()).toMatch(/^manifest-astral-\d{8}\.csv$/);
  const manifestRows = readFileSync(await manifest.path(), 'utf8')
    .trim()
    .split('\r\n');
  expect(manifestRows.at(-1)).toBe('astral,TOTAL,,,94');
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
      page.request.post('/api/loopbox', {
        headers: origin,
        data: { action: 'preorder', accessId },
      }),
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

test('partner portal: apply, approve, draft, submit, publish, appear on home', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const email = `owner-${Date.now()}@pasarpals.example`;
  // A brand-new account applies as a creator collective.
  await page.goto('/login?next=/partners');
  await page.getByRole('button', { name: 'I’m new here' }).click();
  await page.getByLabel('Display name').fill('Pasar Pals');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a long passphrase');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByRole('heading', { name: 'Apply to launch a drop' })).toBeVisible();
  await page.getByRole('button', { name: 'Creator collective' }).click();
  await page.getByLabel('Organisation name').fill('Pasar Pals');
  await page.getByLabel('Contact email').fill('hi@pasarpals.example');
  await page.getByLabel('Number of members').fill('6');
  await page.getByLabel('Portfolio (link)').fill('https://pasarpals.example');
  await page.getByLabel('The series you want to launch').fill('Six wet-market stall mascots.');
  await page
    .getByLabel('How you own the characters')
    .fill('Every character was drawn by one of our six members.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible();
  // The admin approves it.
  await page.goto('/me');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin console' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve Pasar Pals' }).click();
  await expect(page.getByRole('button', { name: 'Approve Pasar Pals' })).toHaveCount(0);
  // The new partner signs back in, drafts a series and submits it.
  await page.goto('/login?next=/partner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a long passphrase');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Pasar Pals' })).toBeVisible();
  await page.getByRole('button', { name: 'New campaign' }).click();
  await page.getByLabel('Series name').fill('Pasar Pals');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Six wet-market stall mascots, made to order.');
  for (const [i, name] of ['Fishball Fin', 'Chilli Chan', 'Golden Durian'].entries())
    await page.locator(`input[name="kinName${i}"]`).fill(name);
  await expect(page.getByText('30 of 30 boxes assigned')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('In review')).toBeVisible();
  // The admin publishes it; it becomes a second drop card on the home page.
  await page.goto('/me');
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Publish Pasar Pals' }).click();
  await expect(page.getByRole('button', { name: 'Publish Pasar Pals' })).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'More drops' })).toBeVisible();
  await page.getByRole('link', { name: 'See the Pasar Pals drop' }).click();
  await expect(page.getByRole('heading', { name: 'Pasar Pals™' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fishball Fin' })).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '09-partner-drop.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('marketplace: Alex buys 2 boxes from Mei, Mei fulfils, Alex confirms, fee recorded', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'collector');
  await page.goto('/market');
  await expect(
    page.getByRole('heading', { name: 'Blind boxes, made by collectors.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Tropical Treats/ }).click();
  await expect(page.getByRole('heading', { name: 'Tropical Treats' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What’s inside: stock and odds' })).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '10-listing.png'), fullPage: true });
  await page.locator('input[name="quantity"]').fill('2');
  await expect(page.getByText('Total S$24.00')).toBeVisible();
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check();
  await page.getByRole('button', { name: 'Buy boxes' }).click();
  // Simulated payment, then the two boxes open one after the other.
  await expect(page.getByText('Box 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { name: 'Your boxes', exact: true })).toBeVisible();
  const orderUrl = page.url().split('?')[0];
  expect(orderUrl).toMatch(/\/orders\/mko-/);
  await expect(page.locator('.drawn')).toHaveCount(2);
  // Mei sees what to hand over and marks it fulfilled.
  await login(page, 'mei');
  await page.goto(orderUrl);
  await expect(page.getByRole('heading', { name: 'Pick list' })).toBeVisible();
  await expect(page.getByText(/^Hand over: /)).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDir, '11-pick-list.png'), fullPage: true });
  await page.getByLabel('Note for the buyer (optional)').fill('Handed over at Toa Payoh exit B');
  await page.getByRole('button', { name: 'Mark as fulfilled' }).click();
  await expect(page.getByText('Handed over', { exact: true })).toBeVisible();
  // Alex confirms receipt.
  await login(page, 'collector');
  await page.goto(orderUrl);
  await expect(page.getByText('Seller’s note: Handed over at Toa Payoh exit B')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm received as drawn' }).click();
  await expect(page.getByText('Receipt confirmed.', { exact: false })).toBeVisible();
  // Chat is text only and carries the off-platform payment warning.
  await page.getByRole('link', { name: 'Open chat' }).click();
  await expect(
    page.getByText('Pay only through LoopBox. Payments outside the app are not protected.'),
  ).toBeVisible();
  await page.getByPlaceholder('Write a message').fill('<script>alert(1)</script> thanks!');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('<script>alert(1)</script> thanks!')).toBeVisible();
  // Mei's dashboard: S$24.00 order → S$1.92 platform fee, S$22.08 owed; the seeded order is still held.
  await login(page, 'mei');
  await page.goto('/sell');
  await expect(page.getByRole('heading', { name: 'Seller dashboard' })).toBeVisible();
  const stat = (label: string) => page.locator('.stat').filter({ hasText: label }).locator('dd');
  await expect(stat('Seller owed')).toHaveText('S$22.08');
  await expect(stat('Platform fee')).toHaveText('S$3.84');
  await expect(stat('Held until receipt')).toHaveText('S$22.08');
  await page.screenshot({ path: resolve(screenshotDir, '12-seller.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('marketplace: verify with demo codes, list a series with a photo, publish, others see it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'demo-0');
  await page.goto('/sell/new');
  await expect(page.getByRole('heading', { name: 'Verify to start selling' })).toBeVisible();
  await page.getByRole('link', { name: 'Verify email and phone' }).click();
  await expect(page.getByText('Demo verification — real SMS is future work')).toBeVisible();
  for (const [field, value, channel] of [
    ['verifyEmail', 'sarah@example.com', 'email'],
    ['verifyPhone', '+65 9123 4567', 'phone'],
  ]) {
    await page.locator(`input[name="${field}"]`).fill(value);
    await page.getByRole('button', { name: `Send ${channel} code` }).click();
    const code = (await page.locator('.demo-code b').innerText()).trim();
    expect(code).toMatch(/^\d{6}$/);
    await page.locator(`input[name="${channel}Code"]`).fill(code);
    await page.getByRole('button', { name: `Verify ${channel}` }).click();
    await expect(page.locator('.demo-code')).toHaveCount(0);
  }
  await expect(page.getByText('You’re verified.')).toBeVisible();
  await page.goto('/sell/new');
  await page.getByLabel('Title').fill('Hawker Heroes Mini');
  await page.getByLabel('Theme').fill('Food');
  await page.locator('input[name="listingPrice"]').fill('9');
  for (const [i, name] of ['Satay Sam', 'Laksa Lin', 'Chendol Chief'].entries())
    await page.locator(`input[name="kinName${i}"]`).fill(name);
  // A text file renamed .png is refused by its bytes; a real PNG is accepted.
  await page.locator('input[name="photos"]').setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<html><script>alert(1)</script></html>'),
  });
  await expect(page.getByText('Photos must be PNG, JPEG or WebP images.')).toBeVisible();
  await page.locator('input[name="photos"]').setInputFiles({
    name: 'box.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.getByRole('img', { name: 'Listing photo 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Publish listing' }).click();
  await expect(page.getByRole('heading', { name: 'Hawker Heroes Mini' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This is your listing' })).toBeVisible();
  // Jun (another seller) finds it in the marketplace but cannot edit it.
  await login(page, 'jun');
  await page.goto('/market');
  await page.getByLabel('Search titles').fill('hawker');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('link', { name: /Hawker Heroes Mini/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo of Hawker Heroes Mini' })).toBeVisible();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('every route fits a 390px phone without sideways scroll and passes axe', async ({ page }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const visits: [string | null, string[]][] = [
    [
      null,
      [
        '/',
        '/drop',
        '/drops',
        '/drops/naruto',
        '/drops/sanrio',
        '/login',
        '/terms',
        '/market',
        '/market/lst-mei',
        '/partners',
        '/verify/astral',
      ],
    ],
    [
      'collector',
      [
        '/quest',
        '/checkout',
        '/checkout/success',
        '/collection',
        '/trades',
        '/reveal/starter-eclipse',
        '/sell',
        '/orders',
        '/orders/mko-seed',
        '/orders/mko-seed/chat',
        '/me',
        '/me/verify',
      ],
    ],
    ['mei', ['/sell/new']],
    ['kopi', ['/partner', '/partner/campaign/kopi-kaki-s1', '/partner/campaign/new']],
    ['admin', ['/studio']],
  ];
  for (const [user, routes] of visits) {
    if (user) await login(page, user);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('.skeleton-page')).toHaveCount(0);
      await noOverflow(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map((v) => ({ route, id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});

test('v2 opening sequence: swipe, short swipe, keyboard, tap fallback, reduced motion; concept checkout', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'collector');
  const origin = { Origin: 'http://127.0.0.1:3100' };
  const win = async (campaignId: string) =>
    (
      await (
        await page.request.post('/api/loopbox', {
          headers: origin,
          data: { action: 'demoWin', campaignId },
        })
      ).json()
    ).accessId as string;
  const naruto = /^(Naruto Uzumaki|Sakura Haruno|Sasuke Uchiha|Itachi Uchiha)$/;
  const edge = /^(Rebecca|David Martinez|Lucy)$/;
  // 1. Swipe: a short stroke only wobbles the pack; a full stroke tears it open.
  await page.goto('/open/' + (await win('naruto')));
  await page.getByRole('button', { name: 'Open my box' }).click();
  const pack = page.getByRole('button', { name: /Foil pack/ });
  await expect(pack).toBeVisible();
  await page.waitForTimeout(700);
  let box = (await pack.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('Swipe all the way across')).toBeVisible();
  await page.waitForTimeout(500);
  box = (await pack.boundingBox())!;
  await page.mouse.move(box.x - 30, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 30, box.y + box.height * 0.55, { steps: 14 });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: naruto })).toBeVisible();
  await expect(page.getByText('Concept partner drop — demo only, not licensed').first()).toBeVisible();
  // 2. Keyboard: Enter opens the box, Enter tears the pack.
  await page.goto('/open/' + (await win('edgerunners')));
  await expect(page.getByRole('button', { name: 'Open my box' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(pack).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: edge })).toBeVisible();
  // 3. No swipe for five seconds: a plain button tears it instead.
  await page.goto('/open/' + (await win('edgerunners')));
  await page.getByRole('button', { name: 'Open my box' }).click();
  await page.getByRole('button', { name: 'Tap here to tear instead' }).click({ timeout: 9000 });
  await expect(page.getByRole('heading', { name: edge })).toBeVisible();
  // 4. Reduced motion: no swipe, a "Tear open" button.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/open/' + (await win('naruto')));
  await page.getByRole('button', { name: 'Open my box' }).click();
  await page.getByRole('button', { name: 'Tear open' }).click();
  await expect(page.getByRole('heading', { name: naruto })).toBeVisible();
  // 5. Concept drops check out with a demo payment, never a card.
  await page.goto('/checkout');
  await expect(page.getByRole('checkbox', { name: /^Select / })).toHaveCount(4);
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check();
  await page.getByRole('button', { name: 'Checkout', exact: true }).click();
  await page.getByRole('checkbox', { name: 'I understand these figures will be made just for me.' }).check();
  await page.getByRole('button', { name: 'Yes, confirm & pay' }).click();
  await expect(page.getByRole('heading', { name: 'Demo payment' })).toBeVisible();
  await expect(page.getByText('This is a concept drop. No money is charged.')).toBeVisible();
  await page.getByRole('button', { name: 'Complete demo payment' }).click();
  await expect(page.getByRole('heading', { name: 'Confirmed. You’re on the production list.' })).toBeVisible();
  await expect(page.getByRole('img', { name: /figure from (Naruto|Cyberpunk: Edgerunners) \(concept render\)$/ })).toHaveCount(4);
  const snap = await snapshot(page);
  expect(snap.items.filter((i: { state: string }) => i.state === 'confirmed')).toHaveLength(4);
  expect(snap.items.every((i: { payment_mode: string }) => i.payment_mode === 'demo')).toBe(true);
  expect(errors).toEqual([]);
});

test('v2 add more by QR: admin sheet, manual code, photo, duplicate, taken, direct link, logged out', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'admin');
  await page.goto('/admin/qr-sheet');
  await page.getByRole('button', { name: 'Generate codes' }).click();
  await expect(page.locator('.qr-grid li')).toHaveCount(20);
  await expect(page.getByRole('img', { name: /^QR code for Nova Scout #001 \/ 100$/ })).toBeVisible();
  const codes = await page.locator('.qr-grid code').allInnerTexts();
  await login(page, 'collector');
  await page.goto('/collection');
  await page.getByRole('button', { name: 'Add more' }).click();
  await page.getByRole('button', { name: 'Enter code manually' }).click();
  await page.locator('input[name="figureCode"]').fill('not-a-code');
  await page.getByRole('button', { name: 'Add figure' }).click();
  await expect(page.getByText('That code isn’t a LoopBox figure code. Check it and try again.')).toBeVisible();
  await page.locator('input[name="figureCode"]').fill(codes[0].toLowerCase());
  await page.getByRole('button', { name: 'Add figure' }).click();
  await expect(page.getByText(/Verified physical · #001 \/ 100/)).toBeVisible();
  await page.getByRole('button', { name: 'Show my collection' }).click();
  await expect(page.getByText('Verified physical', { exact: true })).toHaveCount(1);
  // Direct link from a phone camera: already mine, then someone else's, then a fresh one.
  await page.goto('/claim/' + codes[0]);
  await expect(page.getByRole('heading', { name: 'Already in your collection.' })).toBeVisible();
  await login(page, 'demo-0');
  await page.goto('/claim/' + codes[0]);
  await expect(page.getByRole('heading', { name: 'Someone already added this figure.' })).toBeVisible();
  await page.goto('/claim/' + codes[1]);
  await expect(page.getByText(/Verified physical ·/)).toBeVisible();
  await page.context().clearCookies();
  await page.goto('/claim/' + codes[2]);
  await expect(page.getByRole('heading', { name: 'Sign in to add this figure.' })).toBeVisible();
  await noOverflow(page);
  expect(errors).toEqual([]);
});
