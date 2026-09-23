// M9: every IDOR case in AGENTS.md section 17, one test per ✗ cell of the RBAC matrix that has an
// endpoint, and the DEMO_MODE=false smoke. Each case also checks that nothing changed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../src/server/db';
import { DomainError } from '../src/server/service';
import { App } from '../src/server/app';
import type { CampaignInput, ListingInput } from '../src/server/validation';

const open: App[] = [];
let savedDb: string | undefined;
beforeEach(() => {
  savedDb = process.env.LOOPBOX_DB;
  process.env.LOOPBOX_DB = join(mkdtempSync(join(tmpdir(), 'loopbox-authz-')), 'db.sqlite');
});
afterEach(() => {
  if (savedDb === undefined) delete process.env.LOOPBOX_DB;
  else process.env.LOOPBOX_DB = savedDb;
  while (open.length) open.pop()!.db.close();
});
function make(demo = true) {
  const s = new App(createDatabase(':memory:'), () => Date.now(), demo);
  open.push(s);
  return s;
}
async function codeOf(fn: () => unknown) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return `${e.code}:${e.status}`;
    throw e;
  }
  return 'no error';
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const listing: ListingInput = {
  title: 'Night Owls',
  theme: 'Animals',
  description: '',
  price: 1000,
  fulfilment: 'SHIP',
  characters: [
    { name: 'Hoot', rarity: 'COMMON', declared: 2, color: '#AA8844' },
    { name: 'Moon Owl', rarity: 'RARE', declared: 1, color: '#EEEEFF' },
  ],
  photoIds: [],
};
const campaign = (): CampaignInput => ({
  name: 'Owl Parliament',
  description: 'A parliament of owls, made to order.',
  price: 1500,
  capacity: 4,
  max_per_user: 2,
  starts_at: Date.now() - 60000,
  ends_at: Date.now() + 86400000,
  trade_ends_at: Date.now() + 2 * 86400000,
  game_mode: 'lore',
  required_score: 10,
  attempts_per_day: 5,
  characters: [
    { name: 'Hoot', rarity: 'COMMON', units: 3, color: '#AA8844', description: '' },
    { name: 'Moon Owl', rarity: 'RARE', units: 1, color: '#EEEEFF', description: '' },
  ],
});
const snapshotOf = (s: App, sql: string, ...args: string[]) => JSON.stringify(s.all(sql, ...args));

describe('IDOR (AGENTS.md section 17)', () => {
  it('reveal another user’s allocation', async () => {
    const s = make();
    const sarah = s.one<{ id: string }>(
      "SELECT id FROM allocations WHERE owner_id='demo-0' LIMIT 1",
    )!.id;
    const before = snapshotOf(s, 'SELECT * FROM allocations WHERE id=?', sarah);
    expect(await codeOf(() => s.reveal('collector', sarah))).toBe('ALLOCATION_NOT_FOUND:404');
    expect(snapshotOf(s, 'SELECT * FROM allocations WHERE id=?', sarah)).toBe(before);
  });
  it('trade (or withdraw) another user’s allocation', async () => {
    const s = make();
    const sarah = s.one<{ id: string }>(
      "SELECT id FROM allocations WHERE owner_id='demo-0' LIMIT 1",
    )!.id;
    expect(await codeOf(() => s.listTrade('collector', sarah, ['eclipse']))).toBe(
      'ALLOCATION_NOT_FOUND:404',
    );
    expect(await codeOf(() => s.cancelListing('collector', sarah))).toBe(
      'ALLOCATION_NOT_FOUND:404',
    );
  });
  it('respond to a match you are not in', async () => {
    const s = make();
    const win = s.demoWin('collector');
    const { allocationId } = s.preorder('collector', win.accessId);
    s.reveal('collector', allocationId);
    // Alex's eclipse duplicate against Sarah's listed aurora: a rare-for-rare match.
    const dup = s.one<{ id: string }>(
      "SELECT id FROM allocations WHERE owner_id='collector' AND character_id=(SELECT character_id FROM allocations WHERE id=?) AND id<>? LIMIT 1",
      allocationId,
      allocationId,
    );
    s.listTrade('collector', dup?.id ?? allocationId, ['aurora']);
    const match = s.one<{ id: string }>("SELECT id FROM matches WHERE status='PENDING' LIMIT 1");
    expect(match).toBeTruthy();
    expect(await codeOf(() => s.respond('priya', match!.id, true))).toMatch(/:(403|404)$/);
    expect(s.one('SELECT status FROM matches WHERE id=?', match!.id)).toEqual({
      status: 'PENDING',
    });
  });
  it('read another partner’s analytics or manifest', async () => {
    const s = make();
    expect(await codeOf(() => s.analytics('kopi', 'astral'))).toBe('FORBIDDEN:403');
    expect(await codeOf(() => s.manifest('kopi', 'astral'))).toBe('FORBIDDEN:403');
    expect(await codeOf(() => s.campaignDraft('business', 'kopi-kaki-s1'))).toBe('NOT_FOUND:404');
  });
  it('edit another seller’s listing', async () => {
    const s = make();
    const before = snapshotOf(s, "SELECT * FROM listings WHERE id='lst-mei'");
    expect(await codeOf(() => s.saveListing('jun', { ...listing, listingId: 'lst-mei' }))).toBe(
      'FORBIDDEN:403',
    );
    expect(await codeOf(() => s.pauseListing('jun', 'lst-mei'))).toBe('FORBIDDEN:403');
    expect(snapshotOf(s, "SELECT * FROM listings WHERE id='lst-mei'")).toBe(before);
  });
  it('fulfil another seller’s order', async () => {
    const s = make();
    expect(await codeOf(() => s.fulfil('jun', 'mko-seed', 'not mine'))).toBe('FORBIDDEN:403');
    expect(s.one("SELECT status FROM market_orders WHERE id='mko-seed'")).toEqual({
      status: 'PAID_HELD',
    });
  });
  it('confirm (or report) another buyer’s order', async () => {
    const s = make();
    expect(await codeOf(() => s.confirmReceipt('priya', 'mko-seed'))).toBe('FORBIDDEN:403');
    expect(await codeOf(() => s.report('priya', 'mko-seed', 'OTHER', ''))).toBe('FORBIDDEN:403');
    expect(s.one("SELECT status,payout_status FROM market_orders WHERE id='mko-seed'")).toEqual({
      status: 'PAID_HELD',
      payout_status: 'HELD',
    });
  });
  it('read or post in a chat you are not in, or open an order that isn’t yours', async () => {
    const s = make();
    expect(await codeOf(() => s.messages('jun', 'thread-seed'))).toBe('NOT_FOUND:404');
    expect(await codeOf(() => s.sendMessage('jun', 'thread-seed', 'hi'))).toBe('NOT_FOUND:404');
    expect(await codeOf(() => s.orderView('jun', 'mko-seed'))).toBe('NOT_FOUND:404');
  });
  it('redeem another user’s access', async () => {
    const s = make();
    const g = s.startGame('priya', 'lore');
    const access = s.completeGame('priya', g.id, [1, 0, 2]).accessId!;
    expect(await codeOf(() => s.checkout('collector', access, true))).toBe('INVALID_ACCESS:403');
    expect(await codeOf(() => s.preorder('collector', access))).toBe('INVALID_ACCESS:403');
    expect(s.one('SELECT status FROM access WHERE id=?', access)).toEqual({ status: 'AVAILABLE' });
  });
  it('see another uploader’s unpublished photo', async () => {
    const s = make();
    const { photoId } = s.saveUpload('mei', PNG);
    expect(await codeOf(() => s.photo(photoId, 'jun'))).toBe('NOT_FOUND:404');
  });
});

describe('RBAC matrix: every ✗ cell with an endpoint is refused', () => {
  it('BUSINESS and ADMIN cannot play, reserve or buy B2C', async () => {
    const s = make();
    for (const who of ['business', 'admin']) {
      expect(await codeOf(() => s.startGame(who, 'lore'))).toBe('COLLECTOR_ONLY:403');
      expect(await codeOf(() => s.demoWin(who))).toBe('COLLECTOR_ONLY:403');
      expect(await codeOf(() => s.waitlist(who))).toBe('COLLECTOR_ONLY:403');
    }
    const win = s.demoWin('priya');
    expect(await codeOf(() => s.checkout('business', win.accessId, true))).toBe(
      'COLLECTOR_ONLY:403',
    );
    expect(await codeOf(() => s.checkout('admin', win.accessId, true))).toBe('COLLECTOR_ONLY:403');
  });
  it('BUSINESS and ADMIN cannot reveal, keep or trade allocations', async () => {
    const s = make();
    const alex = s.one<{ id: string }>(
      "SELECT id FROM allocations WHERE owner_id='collector' LIMIT 1",
    )!.id;
    for (const who of ['business', 'admin']) {
      expect(await codeOf(() => s.reveal(who, alex))).toBe('ALLOCATION_NOT_FOUND:404');
      expect(await codeOf(() => s.listTrade(who, alex, ['aurora']))).toBe(
        'ALLOCATION_NOT_FOUND:404',
      );
      expect(await codeOf(() => s.cancelListing(who, alex))).toBe('ALLOCATION_NOT_FOUND:404');
    }
  });
  it('unverified COLLECTOR, BUSINESS and ADMIN cannot create or publish listings or upload', async () => {
    const s = make();
    expect(await codeOf(() => s.saveListing('demo-0', listing))).toBe('VERIFICATION_REQUIRED:403');
    expect(await codeOf(() => s.saveUpload('demo-0', PNG))).toBe('VERIFICATION_REQUIRED:403');
    for (const who of ['business', 'admin']) {
      expect(await codeOf(() => s.saveListing(who, listing))).toBe('FORBIDDEN:403');
      expect(await codeOf(() => s.publishListing(who, 'lst-mei'))).toBe('FORBIDDEN:403');
      expect(await codeOf(() => s.saveUpload(who, PNG))).toBe('FORBIDDEN:403');
    }
  });
  it('BUSINESS and ADMIN cannot buy C2C, and nobody buys their own listing', async () => {
    const s = make();
    expect(await codeOf(() => s.buyListing('business', 'lst-jun', 1, true))).toBe('FORBIDDEN:403');
    expect(await codeOf(() => s.buyListing('admin', 'lst-jun', 1, true))).toBe('FORBIDDEN:403');
    expect(await codeOf(() => s.buyListing('jun', 'lst-jun', 1, true))).toBe('CANNOT_BUY_OWN:403');
    expect(s.one("SELECT COUNT(*) AS n FROM market_orders WHERE listing_id='lst-jun'")).toEqual({
      n: 0,
    });
  });
  it('COLLECTOR and verified sellers cannot draft campaigns or read partner dashboards and manifests', async () => {
    const s = make();
    for (const who of ['demo-0', 'mei']) {
      expect(await codeOf(() => s.saveDraftCampaign(who, campaign()))).toBe('BUSINESS_ONLY:403');
      expect(await codeOf(() => s.partnerDashboard(who))).toBe('BUSINESS_ONLY:403');
      expect(await codeOf(() => s.analytics(who, 'astral'))).toBe('BUSINESS_ONLY:403');
      expect(await codeOf(() => s.manifest(who, 'astral'))).toBe('BUSINESS_ONLY:403');
      expect(await codeOf(() => s.advance(who, 'astral'))).toBe('BUSINESS_ONLY:403');
    }
  });
  it('only ADMIN publishes/closes campaigns, decides applications, resolves reports and sweeps', async () => {
    const s = make();
    const { reportId } = s.report('collector', 'mko-seed', 'OTHER', '');
    for (const who of ['collector', 'mei', 'business']) {
      expect(await codeOf(() => s.publishCampaign(who, 'kopi-kaki-s1'))).toBe('FORBIDDEN:403');
      expect(await codeOf(() => s.closeCampaign(who, 'astral'))).toBe('FORBIDDEN:403');
      expect(await codeOf(() => s.decideApplication(who, 'app-hawker', 'APPROVE'))).toBe(
        'FORBIDDEN:403',
      );
      expect(await codeOf(() => s.resolveReport(who, reportId, 'DISMISS'))).toBe('FORBIDDEN:403');
      expect(await codeOf(() => s.sweep(who))).toBe('FORBIDDEN:403');
      expect(await codeOf(() => s.reports(who))).toBe('FORBIDDEN:403');
      expect(await codeOf(() => s.auditLog(who))).toBe('FORBIDDEN:403');
      expect(await codeOf(() => s.applications(who))).toBe('FORBIDDEN:403');
    }
    expect(s.one('SELECT status FROM reports WHERE id=?', reportId)).toEqual({ status: 'OPEN' });
    expect(s.one("SELECT status FROM partner_applications WHERE id='app-hawker'")).toEqual({
      status: 'SUBMITTED',
    });
  });
});

describe('DEMO_MODE=false smoke', () => {
  it('hides demo identities and refuses demo sign-in, demoWin, preorder and simulated payment', async () => {
    const s = make(false);
    expect(s.demoIdentities()).toEqual([]);
    expect(s.snapshot(null).identities).toEqual([]);
    // Identities are hidden; a forged demo sign-in is refused (pinned in admin.test.ts).
    expect(await codeOf(() => s.login('collector'))).toBe('DEMO_DISABLED:403');
    expect(await codeOf(() => s.demoWin('collector'))).toBe('NOT_FOUND:404');
    expect(await codeOf(() => s.simulatePayment('collector', 'mko-seed', 'C2C'))).toBe(
      'NOT_FOUND:404',
    );
    const g = s.startGame('priya', 'lore');
    const access = s.completeGame('priya', g.id, [1, 0, 2]).accessId!;
    expect(await codeOf(() => s.preorder('priya', access))).toBe('NOT_FOUND:404');
  });
  it('never returns the OTP code, and payments without keys are unavailable', async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const s = make(false);
      expect(s.sendOtp('demo-0', 'EMAIL', 'sarah@example.com')).toEqual({ sent: true });
      expect(await codeOf(() => s.buyListing('collector', 'lst-jun', 1, true))).toBe(
        'PAYMENTS_NOT_CONFIGURED:503',
      );
    } finally {
      if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
    }
  });
});
