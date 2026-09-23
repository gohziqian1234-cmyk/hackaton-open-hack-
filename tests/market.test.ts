import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createDatabase } from '../src/server/db';
import { DomainError, type PaymentEvent } from '../src/server/service';
import { App } from '../src/server/app';
import { sniffImage } from '../src/server/market';
import { actionSchema, listingSchema, type ListingInput } from '../src/server/validation';
import { createCheckoutSession } from '../src/server/stripe';
import { ChatBubble } from '../src/components/chat-bubble';

const ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SIMULATE_PAYMENTS',
  'LOOPBOX_DB',
  'MAX_CHARGE_CENTS',
];
let saved: Record<string, string | undefined>;
let dir: string;
const open: App[] = [];
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'loopbox-market-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  // Uploads are written next to the database file.
  process.env.LOOPBOX_DB = join(dir, 'unit.sqlite');
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  while (open.length) open.pop()!.db.close();
});

let clock = Date.now();
function make(demo = true, db = createDatabase(':memory:')) {
  clock = Date.now();
  const s = new App(db, () => clock, demo);
  open.push(s);
  return s;
}
function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return `${e.code}:${e.status}`;
    throw e;
  }
  return 'no error';
}
async function codeOfAsync(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return `${e.code}:${e.status}`;
    throw e;
  }
  return 'no error';
}
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const WEBP = new Uint8Array(
  [...'RIFF']
    .map((c) => c.charCodeAt(0))
    .concat(
      [0, 0, 0, 0],
      [...'WEBPVP8 '].map((c) => c.charCodeAt(0)),
    ),
);
function listing(overrides: Partial<ListingInput> = {}): ListingInput {
  return {
    title: 'Kopi Critters',
    theme: 'Food',
    description: 'Hand-painted resin kopi cups.',
    price: 1500,
    fulfilment: 'MEETUP',
    characters: [
      { name: 'Kopi O', rarity: 'COMMON', declared: 3, color: '#8B5A2B' },
      { name: 'Teh Peng', rarity: 'RARE', declared: 2, color: '#E0B070' },
    ],
    photoIds: [],
    ...overrides,
  };
}
/** Mei drafts, uploads a photo and publishes a 5-box listing. */
function publish(s: App, seller = 'mei', overrides: Partial<ListingInput> = {}) {
  const { photoId } = s.saveUpload(seller, PNG);
  const { listingId } = s.saveListing(seller, listing({ photoIds: [photoId], ...overrides }));
  s.publishListing(seller, listingId);
  return listingId;
}
const remaining = (s: App, listingId: string) =>
  s.one<{ n: number }>(
    'SELECT SUM(remaining) AS n FROM listing_characters WHERE listing_id=?',
    listingId,
  )!.n;
async function buy(s: App, buyer: string, listingId: string, quantity = 2) {
  const r = await s.buyListing(buyer, listingId, quantity, true);
  if (!('simulated' in r)) throw new Error('expected a simulated order');
  return r.orderId;
}

describe('verification (simulated OTP)', () => {
  it('stores only a hash, shows the code in demo mode, and verifies email and phone', () => {
    const s = make();
    const sent = s.sendOtp('demo-0', 'EMAIL', 'sarah@example.com');
    expect(sent.demoCode).toMatch(/^\d{6}$/);
    const row = s.one<{ code_hash: string }>(
      "SELECT code_hash FROM otp_codes WHERE user_id='demo-0'",
    )!;
    expect(row.code_hash).not.toContain(sent.demoCode!);
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.verifyOtp('demo-0', 'EMAIL', sent.demoCode!)).toEqual({ verified: true });
    expect(s.isVerified('demo-0')).toBe(false);
    const phone = s.sendOtp('demo-0', 'PHONE', '+6591234567');
    s.verifyOtp('demo-0', 'PHONE', phone.demoCode!);
    expect(s.isVerified('demo-0')).toBe(true);
    expect(s.verificationStatus('demo-0')).toMatchObject({
      email: 'sarah@example.com',
      phone: '+6591234567',
    });
  });
  it('locks after 5 wrong codes, expires after 10 minutes, and never shows the code outside demo', () => {
    const s = make();
    const { demoCode } = s.sendOtp('demo-0', 'PHONE', '+6591234567');
    const wrong = demoCode === '000000' ? '111111' : '000000';
    for (let i = 4; i >= 0; i--)
      expect(s.verifyOtp('demo-0', 'PHONE', wrong)).toEqual({ verified: false, triesLeft: i });
    expect(codeOf(() => s.verifyOtp('demo-0', 'PHONE', demoCode!))).toBe('OTP_LOCKED:429');
    const again = s.sendOtp('demo-0', 'PHONE', '+6591234567');
    clock += 10 * 60000 + 1;
    expect(codeOf(() => s.verifyOtp('demo-0', 'PHONE', again.demoCode!))).toBe('OTP_EXPIRED:410');
    const live = make(false);
    expect(live.sendOtp('demo-0', 'PHONE', '+6591234567')).toEqual({ sent: true });
  });
  it('limits codes to 5 per 10 minutes and refuses an email another account uses', () => {
    const s = make();
    for (let i = 0; i < 5; i++) s.sendOtp('demo-0', 'PHONE', '+6591234567');
    expect(codeOf(() => s.sendOtp('demo-0', 'PHONE', '+6591234567'))).toBe('RATE_LIMITED:429');
    const t = make();
    expect(codeOf(() => t.sendOtp('demo-0', 'EMAIL', 'mei@loopbox.example'))).toBe(
      'EMAIL_TAKEN:409',
    );
  });
});

describe('uploads', () => {
  it('recognises PNG, JPEG and WebP by magic bytes only', () => {
    expect(sniffImage(PNG)?.mime).toBe('image/png');
    expect(sniffImage(JPEG)?.mime).toBe('image/jpeg');
    expect(sniffImage(WEBP)?.mime).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('GIF89a...'))).toBeNull();
  });
  it('rejects non-images (415), empty or over 2 MB (413), and unverified uploaders (403)', () => {
    const s = make();
    expect(codeOf(() => s.saveUpload('mei', new TextEncoder().encode('<html><script>')))).toBe(
      'UNSUPPORTED_IMAGE:415',
    );
    expect(codeOf(() => s.saveUpload('mei', new Uint8Array()))).toBe('REQUEST_TOO_LARGE:413');
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    expect(codeOf(() => s.saveUpload('mei', big))).toBe('REQUEST_TOO_LARGE:413');
    expect(codeOf(() => s.saveUpload('demo-0', PNG))).toBe('VERIFICATION_REQUIRED:403');
    const { photoId } = s.saveUpload('mei', PNG);
    const stored = s.photo(photoId, 'mei');
    expect(stored.mime).toBe('image/png');
    expect(stored.path.startsWith(join(dir, 'uploads'))).toBe(true);
    expect(readdirSync(join(dir, 'uploads'))).toContain(`${photoId}.png`);
  });
  it('a photo is private until its listing is live', () => {
    const s = make();
    const { photoId } = s.saveUpload('mei', PNG);
    expect(codeOf(() => s.photo(photoId, 'jun'))).toBe('NOT_FOUND:404');
    expect(codeOf(() => s.photo(photoId))).toBe('NOT_FOUND:404');
    // Jun cannot attach Mei's upload to his own listing.
    expect(codeOf(() => s.saveListing('jun', listing({ photoIds: [photoId] })))).toBe(
      'FORBIDDEN:403',
    );
    const { listingId } = s.saveListing('mei', listing({ photoIds: [photoId] }));
    s.publishListing('mei', listingId);
    expect(s.photo(photoId).mime).toBe('image/png');
  });
});

describe('listings', () => {
  it('validates title, 2–12 characters, declared 1–500 and price at the boundary', () => {
    const ok = listing();
    expect(listingSchema.safeParse(ok).success).toBe(true);
    const bad: Partial<ListingInput>[] = [
      { title: 'Abc' },
      { price: 99 },
      { characters: [ok.characters[0]] },
      { characters: Array.from({ length: 13 }, () => ok.characters[0]) },
      { characters: [{ ...ok.characters[0], declared: 0 }, ok.characters[1]] },
      { characters: [{ ...ok.characters[0], declared: 501 }, ok.characters[1]] },
      { photoIds: Array.from({ length: 7 }, () => '00000000-0000-0000-0000-000000000000') },
    ];
    for (const b of bad) expect(listingSchema.safeParse({ ...ok, ...b }).success).toBe(false);
  });
  it('an unverified user cannot save or publish (403 VERIFICATION_REQUIRED)', () => {
    const s = make();
    expect(codeOf(() => s.saveListing('demo-0', listing()))).toBe('VERIFICATION_REQUIRED:403');
    expect(codeOf(() => s.publishListing('demo-0', 'lst-mei'))).toBe('VERIFICATION_REQUIRED:403');
    expect(codeOf(() => s.saveListing('business', listing()))).toBe('FORBIDDEN:403');
  });
  it('publishing needs at least one photo; live listings are locked; pause hides them', () => {
    const s = make();
    const { listingId } = s.saveListing('mei', listing());
    expect(codeOf(() => s.publishListing('mei', listingId))).toBe('VALIDATION_FAILED:422');
    expect(s.marketListings().listings.map((l) => l.id)).not.toContain(listingId);
    const live = publish(s);
    expect(s.marketListings().listings.find((l) => l.id === live)).toMatchObject({
      left: 5,
      seller: 'Mei',
    });
    expect(codeOf(() => s.saveListing('mei', listing({ listingId: live })))).toBe(
      'LOCKED_AFTER_LIVE:409',
    );
    s.pauseListing('mei', live);
    expect(s.marketListings().listings.map((l) => l.id)).not.toContain(live);
    expect(codeOf(() => s.listingDetail(live, 'jun'))).toBe('NOT_FOUND:404');
    expect(s.listingDetail(live, 'mei').listing.isMine).toBe(true);
  });
  it('IDOR: another seller cannot edit, publish or pause a listing', () => {
    const s = make();
    const { listingId } = s.saveListing('mei', listing());
    expect(codeOf(() => s.saveListing('jun', listing({ listingId })))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.publishListing('jun', listingId))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.pauseListing('jun', 'lst-mei'))).toBe('FORBIDDEN:403');
  });
  it('search treats % and _ as text, and filters by theme, price and rarity', () => {
    const s = make();
    expect(s.marketListings({ q: '%' }).listings).toHaveLength(0);
    expect(s.marketListings({ q: 'tropical' }).listings.map((l) => l.id)).toEqual(['lst-mei']);
    expect(s.marketListings({ rarity: 'SECRET' }).listings.map((l) => l.id)).toContain('lst-mei');
    expect(s.marketListings({ max: 99 }).listings).toHaveLength(0);
    expect(s.marketListings().themes.length).toBeGreaterThanOrEqual(3);
  });
});

describe('buying', () => {
  it('a seller cannot buy their own listing (403, and the database refuses it too)', async () => {
    const s = make();
    expect(await codeOfAsync(() => s.buyListing('mei', 'lst-mei', 1, true))).toBe(
      'CANNOT_BUY_OWN:403',
    );
    expect(() =>
      s.run(
        "INSERT INTO market_orders (id,listing_id,buyer_id,seller_id,quantity,subtotal_cents,fee_cents,seller_owed_cents,status,payout_status,created_at) VALUES ('x','lst-mei','mei','mei',1,1200,96,1104,'PENDING_PAYMENT','NONE',0)",
      ),
    ).toThrow(/CHECK constraint/);
    expect(await codeOfAsync(() => s.buyListing('business', 'lst-mei', 1, true))).toBe(
      'FORBIDDEN:403',
    );
    expect(await codeOfAsync(() => s.buyListing('admin', 'lst-mei', 1, true))).toBe(
      'FORBIDDEN:403',
    );
    expect(await codeOfAsync(() => s.buyListing('collector', 'lst-mei', 1, false))).toBe(
      'AGE_CONFIRMATION_REQUIRED:400',
    );
    expect(
      actionSchema.safeParse({
        action: 'buyListing',
        listingId: 'lst-mei',
        quantity: 11,
        ageConfirmed: true,
      }).success,
    ).toBe(false);
  });
  it('draws at order time, hides the result until paid, and splits fee and seller share', async () => {
    const s = make();
    const listingId = publish(s);
    s.random = () => 0; // always the first character with stock
    const orderId = await buy(s, 'collector', listingId, 2);
    expect(remaining(s, listingId)).toBe(3);
    const pending = s.orderView('collector', orderId);
    expect(pending.order).toMatchObject({
      status: 'PENDING_PAYMENT',
      subtotal_cents: 3000,
      fee_cents: 240,
      seller_owed_cents: 2760,
    });
    expect(pending.draws).toEqual([]);
    expect(s.one('SELECT COUNT(*) AS n FROM c2c_draws WHERE market_order_id=?', orderId)).toEqual({
      n: 2,
    });
    expect(s.simulatePayment('collector', orderId, 'C2C').outcome).toBe('paid');
    const paid = s.orderView('collector', orderId);
    expect(paid.order).toMatchObject({ status: 'PAID_HELD', payout_status: 'HELD' });
    expect(paid.draws.map((d) => d.name)).toEqual(['Kopi O', 'Kopi O']);
    expect(paid.threadId).toBeTruthy();
    expect(s.orderView('mei', orderId).pickList).toEqual([{ name: 'Kopi O', count: 2 }]);
    expect(s.sellerDashboard('mei').money).toMatchObject({ held: 2760 + 2208, fees: 240 + 192 });
  });
  it('fulfil → confirm moves the payout to OWED and lifts trust', async () => {
    const s = make();
    const orderId = 'mko-seed';
    expect(codeOf(() => s.confirmReceipt('mei', orderId))).toBe('FORBIDDEN:403');
    s.fulfil('mei', orderId, 'Handed over at Toa Payoh');
    expect(codeOf(() => s.fulfil('mei', orderId, ''))).toBe('INVALID_STATE:409');
    s.confirmReceipt('collector', orderId);
    expect(s.orderView('mei', orderId).order).toMatchObject({
      status: 'COMPLETED',
      payout_status: 'OWED',
    });
    expect(s.sellerDashboard('mei').money).toMatchObject({ owed: 2208, fees: 192, held: 0 });
    expect(s.sellerDashboard('mei').trust).toBe(100); // 100 − 25×0 + 2×1, clamped
  });
  it('an unpaid order expires after 31 minutes and its boxes go back in stock', async () => {
    const s = make();
    const listingId = publish(s);
    const orderId = await buy(s, 'collector', listingId, 5);
    expect(s.listingDetail(listingId).listing.status).toBe('SOLD_OUT');
    clock += 31 * 60000 + 1;
    expect(s.marketListings().listings.find((l) => l.id === listingId)).toMatchObject({
      left: 5,
      status: 'ACTIVE',
    });
    expect(s.orderView('collector', orderId).order.status).toBe('EXPIRED');
    expect(s.one('SELECT COUNT(*) AS n FROM c2c_draws WHERE market_order_id=?', orderId)).toEqual({
      n: 5,
    });
    expect(codeOf(() => s.simulatePayment('collector', orderId, 'C2C'))).toBe('ALREADY_DONE:409');
  });
  it('Stripe mode: one payment for three identical events, and a late payment is refunded', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    const s = make();
    const listingId = publish(s);
    const fake: typeof createCheckoutSession = async (input) => ({
      id: 'cs_test_' + input.orderId,
      url: 'https://checkout.stripe.test/' + input.orderId,
      expiresAt: clock + 31 * 60000,
    });
    const r = await s.buyListing('collector', listingId, 1, true, fake);
    expect('url' in r && r.url).toContain('checkout.stripe.test');
    const event = (type: PaymentEvent['type'], id: string): PaymentEvent => ({
      id,
      type,
      session: {
        id: 'cs_test_' + r.orderId,
        payment_status: type === 'checkout.session.completed' ? 'paid' : 'unpaid',
        payment_intent: 'pi_' + id,
        client_reference_id: r.orderId,
        metadata: { kind: 'C2C', order_id: r.orderId },
      },
    });
    const refunds: string[] = [];
    for (let i = 0; i < 3; i++)
      await s.handlePaymentEvent(
        event('checkout.session.completed', 'evt_1'),
        async (pi) => void refunds.push(pi),
      );
    expect(s.orderView('collector', r.orderId).order.status).toBe('PAID_HELD');
    // Second order: session expires, then a payment arrives anyway.
    const late = await s.buyListing('collector', listingId, 1, true, fake);
    const expired: PaymentEvent = {
      ...event('checkout.session.expired', 'evt_2'),
      session: {
        ...event('checkout.session.expired', 'evt_2').session,
        client_reference_id: late.orderId,
        metadata: { kind: 'C2C', order_id: late.orderId },
      },
    };
    await s.handlePaymentEvent(expired);
    const paidLate: PaymentEvent = {
      ...event('checkout.session.completed', 'evt_3'),
      session: {
        ...event('checkout.session.completed', 'evt_3').session,
        client_reference_id: late.orderId,
        metadata: { kind: 'C2C', order_id: late.orderId },
      },
    };
    await s.handlePaymentEvent(paidLate, async (pi) => void refunds.push(pi));
    expect(s.orderView('collector', late.orderId).order.status).toBe('REFUNDED');
    expect(refunds).toEqual(['pi_evt_3']);
    expect(remaining(s, listingId)).toBe(4);
  });
  it('refuses a basket above the spending cap', async () => {
    process.env.MAX_CHARGE_CENTS = '2000';
    const s = make();
    expect(await codeOfAsync(() => s.buyListing('collector', 'lst-mei', 2, true))).toBe(
      'SPENDING_CAP:422',
    );
  });
  it('50 parallel buys for 5 remaining boxes: stock never negative, at most 5 drawn', async () => {
    const file = join(dir, `race-${Date.now()}.sqlite`);
    const first = make(true, createDatabase(file));
    const listingId = publish(first);
    const buyers = Array.from({ length: 50 }, (_, i) => `racer-${i}`);
    for (const id of buyers)
      first.run("INSERT INTO users (id,name,role,created_at) VALUES (?,?,'COLLECTOR',0)", id, id);
    // Five connections to the same file, like five server processes.
    const services = [first, ...Array.from({ length: 4 }, () => make(true, createDatabase(file)))];
    const results = await Promise.allSettled(
      buyers.map((b, i) => services[i % services.length].buyListing(b, listingId, 1, true)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(5);
    for (const r of results)
      if (r.status === 'rejected')
        expect((r.reason as DomainError).code).toMatch(/SOLD_OUT|INVALID_STATE/);
    expect(
      first.one<{ n: number }>(
        'SELECT MIN(remaining) AS n FROM listing_characters WHERE listing_id=?',
        listingId,
      )!.n,
    ).toBeGreaterThanOrEqual(0);
    expect(
      first.one(
        "SELECT COUNT(*) AS n FROM c2c_draws d JOIN market_orders o ON o.id=d.market_order_id WHERE o.listing_id=? AND o.status<>'EXPIRED'",
        listingId,
      ),
    ).toEqual({ n: 5 });
    expect(remaining(first, listingId)).toBe(0);
  });
  it('the draw log is append-only', () => {
    const s = make();
    expect(() =>
      s.run(
        "UPDATE c2c_draws SET listing_character_id='lst-mei-4' WHERE market_order_id='mko-seed'",
      ),
    ).toThrow(/IMMUTABLE/);
    expect(() => s.run("DELETE FROM c2c_draws WHERE market_order_id='mko-seed'")).toThrow(
      /IMMUTABLE/,
    );
  });
});

describe('orders, reports and trust', () => {
  it('IDOR: only the parties see an order; only the seller fulfils; only the buyer confirms or reports', () => {
    const s = make();
    expect(codeOf(() => s.orderView('jun', 'mko-seed'))).toBe('NOT_FOUND:404');
    expect(codeOf(() => s.fulfil('jun', 'mko-seed', ''))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.fulfil('collector', 'mko-seed', ''))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.confirmReceipt('priya', 'mko-seed'))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.report('mei', 'mko-seed', 'OTHER', ''))).toBe('FORBIDDEN:403');
    expect(s.orderView('admin', 'mko-seed').role).toBe('ADMIN');
    expect(s.myMarketOrders('jun')).toEqual({ buying: [], selling: [] });
  });
  it('upheld reports refund the buyer, void the payout, and below 50 trust suspend listings', async () => {
    const s = make();
    const { reportId } = s.report('collector', 'mko-seed', 'WRONG_ITEM', 'Got a different figure');
    expect(await codeOfAsync(() => s.resolveReport('mei', reportId, 'UPHOLD'))).toBe(
      'FORBIDDEN:403',
    );
    const refunds: string[] = [];
    const r = await s.resolveReport(
      'admin',
      reportId,
      'UPHOLD',
      async (pi) => void refunds.push(pi),
    );
    expect(r).toEqual({ decision: 'UPHOLD', trust: 75 });
    expect(s.orderView('collector', 'mko-seed').order).toMatchObject({
      status: 'REFUNDED',
      payout_status: 'VOID',
    });
    expect(refunds).toEqual([]); // simulated payment: nothing to send to Stripe
    expect(await codeOfAsync(() => s.resolveReport('admin', reportId, 'DISMISS'))).toBe(
      'INVALID_STATE:409',
    );
    // Two more upheld reports push Mei below 50.
    for (let i = 0; i < 2; i++) {
      s.run("UPDATE listings SET status='ACTIVE' WHERE id='lst-mei'");
      const orderId = await buy(s, 'collector', 'lst-mei', 1);
      s.simulatePayment('collector', orderId, 'C2C');
      const rep = s.report('collector', orderId, 'NOT_DELIVERED', '');
      await s.resolveReport('admin', rep.reportId, 'UPHOLD');
    }
    expect(s.sellerDashboard('mei').trust).toBe(25);
    expect(s.listingDetail('lst-mei', 'mei').listing.status).toBe('SUSPENDED');
    expect(await codeOfAsync(() => s.buyListing('collector', 'lst-mei', 1, true))).toBe(
      'INVALID_STATE:409',
    );
  });
  it('a dismissed report releases the payout', async () => {
    const s = make();
    const { reportId } = s.report('collector', 'mko-seed', 'OTHER', '');
    await s.resolveReport('admin', reportId, 'DISMISS');
    expect(s.orderView('mei', 'mko-seed').order).toMatchObject({
      status: 'RESOLVED',
      payout_status: 'OWED',
    });
    expect(s.reports('admin')[0]).toMatchObject({ status: 'DISMISSED' });
    expect(codeOf(() => s.reports('collector'))).toBe('FORBIDDEN:403');
  });
  it('the admin sweep auto-completes orders fulfilled more than 7 days ago', () => {
    const s = make();
    s.fulfil('mei', 'mko-seed', '');
    clock += 7 * 86400000 + 1;
    expect(s.sweep('admin')).toMatchObject({ autoCompleted: 1 });
    expect(s.orderView('mei', 'mko-seed').order).toMatchObject({
      status: 'COMPLETED',
      payout_status: 'OWED',
    });
  });
});

describe('chat', () => {
  it('only the two parties can read or post, and posting is rate limited', () => {
    const s = make();
    expect(s.messages('collector', 'thread-seed')).toHaveLength(3);
    expect(codeOf(() => s.messages('jun', 'thread-seed'))).toBe('NOT_FOUND:404');
    expect(codeOf(() => s.sendMessage('admin', 'thread-seed', 'hi'))).toBe('NOT_FOUND:404');
    const after = s.messages('mei', 'thread-seed').at(-1)!.created_at;
    for (let i = 0; i < 30; i++) s.sendMessage('collector', 'thread-seed', 'msg ' + i);
    expect(codeOf(() => s.sendMessage('collector', 'thread-seed', 'one too many'))).toBe(
      'RATE_LIMITED:429',
    );
    expect(s.messages('mei', 'thread-seed', after)).toHaveLength(30);
  });
  it('a message containing <script> is stored as-is and rendered as text', () => {
    const s = make();
    const body = '<script>alert("x")</script><img src=x onerror=alert(1)>';
    s.sendMessage('collector', 'thread-seed', body);
    const stored = s.messages('mei', 'thread-seed').at(-1)!;
    expect(stored.body).toBe(body);
    const html = renderToStaticMarkup(createElement(ChatBubble, { message: stored, mine: false }));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});
