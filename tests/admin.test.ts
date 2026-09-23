import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/server/db';
import { DomainError, Loopbox, csvCell } from '../src/server/service';

const open: Loopbox[] = [];
afterEach(() => {
  while (open.length) open.pop()!.db.close();
  delete process.env.ADMIN_DEMO;
});
function make(demo = true) {
  const s = new Loopbox(createDatabase(':memory:'), () => Date.now(), demo);
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
function buy(s: Loopbox) {
  const g = s.startGame('collector', 'lore');
  return s.preorder('collector', s.completeGame('collector', g.id, [1, 0, 2]).accessId!);
}
function otherPartner(s: Loopbox) {
  const now = Date.now();
  s.run("INSERT INTO users (id,name,role,created_at) VALUES ('rival','Rival Toys','BUSINESS',?)", now);
  s.run(
    "INSERT INTO partners (id,name,type,owner_user_id,created_at) VALUES ('rival-co','Rival Toys','BRAND','rival',?)",
    now,
  );
  s.run(
    "INSERT INTO partner_members (partner_id,user_id,role,created_at) VALUES ('rival-co','rival','OWNER',?)",
    now,
  );
}
function draft(s: Loopbox, units: number[]) {
  const now = Date.now();
  s.run(
    "INSERT INTO campaigns (id,partner_id,name,description,price,capacity,max_per_user,phase,starts_at,ends_at,trade_ends_at,created_at) VALUES ('kopi','studio','Kopi Kaki','A second series for testing publish.',1500,10,2,'IN_REVIEW',?,?,?,?)",
    now - 1000,
    now + 86400000,
    now + 2 * 86400000,
    now,
  );
  units.forEach((u, i) =>
    s.run(
      "INSERT INTO characters (id,campaign_id,name,rarity,weight,units) VALUES (?,'kopi',?,?,1,?)",
      'kopi-' + i,
      'Kopi ' + i,
      i === 0 ? 'RARE' : 'COMMON',
      u,
    ),
  );
}

describe('manufacturing manifest', () => {
  it('totals equal the final allocations and the file is named per campaign and date', () => {
    const s = make();
    buy(s);
    for (let i = 0; i < 3; i++) s.advance('business');
    const m = s.manifest('business', 'astral');
    const allocations = s.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM allocations WHERE campaign_id='astral'",
    )!.n;
    expect(m.total).toBe(allocations);
    expect(m.total).toBe(94);
    expect(m.final).toBe(true);
    expect(m.filename).toMatch(/^manifest-astral-\d{8}\.csv$/);
    const lines = m.csv.trim().split('\r\n');
    expect(lines[0]).toBe('campaign_id,character_id,character_name,rarity,quantity');
    expect(lines).toHaveLength(1 + 7 + 1);
    expect(lines.at(-1)).toBe('astral,TOTAL,,,94');
    const sum = lines.slice(1, -1).reduce((n, l) => n + Number(l.split(',').at(-1)), 0);
    expect(sum).toBe(94);
  });
  it('is refused to collectors and to members of another partner', () => {
    const s = make();
    otherPartner(s);
    expect(codeOf(() => s.manifest('collector', 'astral'))).toBe('BUSINESS_ONLY:403');
    expect(codeOf(() => s.manifest('rival', 'astral'))).toBe('FORBIDDEN:403');
    expect(s.manifest('admin', 'astral').total).toBe(93);
  });
  it('neutralises spreadsheet formulas and quotes commas in cells', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('Kopi, Kaki')).toBe('"Kopi, Kaki"');
    expect(csvCell(42)).toBe('42');
  });
});

describe('admin lifecycle', () => {
  it('closing twice is INVALID_STATE, and closing reveals the seed', () => {
    const s = make();
    s.closeCampaign('admin', 'astral');
    expect(s.verification('astral').revealed).toBe(true);
    expect(codeOf(() => s.closeCampaign('admin', 'astral'))).toBe('INVALID_STATE:409');
  });
  it('only ADMIN can publish, close or sweep; partners cannot advance other campaigns', () => {
    const s = make();
    otherPartner(s);
    expect(codeOf(() => s.closeCampaign('business', 'astral'))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.sweep('collector'))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.publishCampaign('business', 'astral'))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.advance('rival', 'astral'))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.advance('collector'))).toBe('BUSINESS_ONLY:403');
  });
  it('publish builds a pool and fingerprint, and refuses units that do not add up', () => {
    const s = make();
    draft(s, [2, 4, 3]);
    expect(codeOf(() => s.publishCampaign('admin', 'kopi'))).toBe('VALIDATION_FAILED:422');
    s.run("UPDATE characters SET units=4 WHERE id='kopi-2'");
    expect(s.publishCampaign('admin', 'kopi').phase).toBe('ACTIVE_PREORDER');
    expect(s.all("SELECT * FROM pool_units WHERE campaign_id='kopi'")).toHaveLength(10);
    expect(s.verification('kopi').revealed).toBe(false);
    expect(codeOf(() => s.publishCampaign('admin', 'kopi'))).toBe('INVALID_STATE:409');
  });
  it('after allocation lock, every trade action is refused with 409', () => {
    const s = make();
    const { matchId } = s.listTrade('collector', 'starter-eclipse', ['aurora']);
    for (let i = 0; i < 3; i++) s.advance('business');
    expect(codeOf(() => s.listTrade('collector', 'starter-eclipse', ['aurora']))).toBe(
      'TRADE_WINDOW_CLOSED:409',
    );
    expect(codeOf(() => s.cancelListing('collector', 'starter-eclipse'))).toBe(
      'TRADE_WINDOW_CLOSED:409',
    );
    expect(codeOf(() => s.respond('collector', matchId!, true))).toBe('TRADE_WINDOW_CLOSED:409');
  });
  it('sweep re-runs matching for listings that were waiting', () => {
    const s = make();
    s.demo = false;
    s.run('DELETE FROM preferences');
    s.run("UPDATE allocations SET status='OWNED' WHERE id='sarah-aurora'");
    expect(s.listTrade('collector', 'starter-eclipse', ['aurora']).matched).toBe(false);
    // Sarah lists afterwards without triggering a search (e.g. imported listing).
    s.run("UPDATE allocations SET status='TRADE_LISTED' WHERE id='sarah-aurora'");
    s.run("INSERT INTO preferences (allocation_id,character_id) VALUES ('sarah-aurora','eclipse')");
    expect(s.sweep('admin').matched).toBe(1);
    expect(s.all("SELECT * FROM matches WHERE status='PENDING'")).toHaveLength(1);
  });
  it('writes audit rows for phase changes and admin actions', () => {
    const s = make();
    s.advance('business');
    s.sweep('admin');
    const actions = s.auditLog('admin').map((r) => r.action);
    expect(actions).toContain('campaign.phase');
    expect(actions).toContain('admin.sweep');
    expect(codeOf(() => s.auditLog('business'))).toBe('FORBIDDEN:403');
    expect(s.auditLog('admin', 'campaign').every((r) => r.entity === 'campaign')).toBe(true);
  });
  it('the Admin demo identity can be switched off with ADMIN_DEMO=false', () => {
    const s = make();
    expect(s.login('admin')).toBeTruthy();
    process.env.ADMIN_DEMO = 'false';
    expect(codeOf(() => s.login('admin'))).toBe('DEMO_DISABLED:403');
    expect(s.demoIdentities().map((u) => u.id)).not.toContain('admin');
    expect(codeOf(() => s.login('demo-5'))).toBe('DEMO_DISABLED:403');
  });
});
