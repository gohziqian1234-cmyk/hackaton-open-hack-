import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/server/db';
import { DomainError } from '../src/server/service';
import { App } from '../src/server/app';
import type { CampaignInput, ApplicationInput } from '../src/server/validation';

const open: App[] = [];
afterEach(() => {
  while (open.length) open.pop()!.db.close();
});
function make(now = () => Date.now()) {
  const s = new App(createDatabase(':memory:'), now, true);
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
const application: ApplicationInput = {
  type: 'COLLECTIVE',
  orgName: 'Pasar Pals',
  contactEmail: 'hi@pasarpals.example',
  proposedSeries: 'Six wet-market stall mascots as blind-box figures.',
  ipOwnership: true,
  ipStatement: 'Every character was drawn by one of our members; we hold the rights together.',
  membersCount: 6,
  portfolioUrl: 'https://pasarpals.example',
};
function campaign(overrides: Partial<CampaignInput> = {}): CampaignInput {
  const now = Date.now();
  return {
    name: 'Pasar Pals',
    description: 'Six wet-market stall mascots, made to order.',
    price: 1500,
    capacity: 10,
    max_per_user: 2,
    starts_at: now - 60000,
    ends_at: now + 7 * 86400000,
    trade_ends_at: now + 9 * 86400000,
    game_mode: 'lore',
    required_score: 10,
    attempts_per_day: 5,
    characters: [
      { name: 'Fishball Fin', rarity: 'COMMON', units: 6, color: '#6FC8FF', description: '' },
      { name: 'Chilli Chan', rarity: 'COMMON', units: 3, color: '#FF7F66', description: '' },
      { name: 'Golden Durian', rarity: 'RARE', units: 1, color: '#FFD84D', description: '' },
    ],
    ...overrides,
  };
}
/** New account applies, admin approves, partner drafts and submits, admin publishes. */
function launch(s: App) {
  const { userId } = s.signup('Pasar Pals', 'owner@pasarpals.example', 'a long passphrase');
  const { applicationId } = s.applyPartner(userId, application);
  s.decideApplication('admin', applicationId, 'APPROVE');
  const { campaignId } = s.saveDraftCampaign(userId, campaign());
  s.submitCampaign(userId, campaignId);
  s.publishCampaign('admin', campaignId);
  return { userId, campaignId };
}

describe('partner applications', () => {
  it('approval creates the partner, makes the applicant its owner and a BUSINESS user', () => {
    const s = make();
    const { userId } = s.signup('Pasar Pals', 'owner@pasarpals.example', 'a long passphrase');
    const { applicationId } = s.applyPartner(userId, application);
    expect(codeOf(() => s.applyPartner(userId, application))).toBe('ALREADY_DONE:409');
    const { partnerId } = s.decideApplication('admin', applicationId, 'APPROVE');
    expect(s.user(userId).role).toBe('BUSINESS');
    expect(
      s.one('SELECT role FROM partner_members WHERE partner_id=? AND user_id=?', partnerId, userId),
    ).toEqual({
      role: 'OWNER',
    });
    expect(s.one('SELECT type,name FROM partners WHERE id=?', partnerId)).toEqual({
      type: 'COLLECTIVE',
      name: 'Pasar Pals',
    });
    expect(codeOf(() => s.decideApplication('admin', applicationId, 'REJECT'))).toBe(
      'INVALID_STATE:409',
    );
  });
  it('only admins decide, and requesting info needs a note and reopens the form', () => {
    const s = make();
    expect(codeOf(() => s.decideApplication('business', 'app-hawker', 'APPROVE'))).toBe(
      'FORBIDDEN:403',
    );
    expect(codeOf(() => s.decideApplication('admin', 'app-hawker', 'REQUEST_INFO'))).toBe(
      'VALIDATION_FAILED:422',
    );
    s.decideApplication(
      'admin',
      'app-hawker',
      'REQUEST_INFO',
      'Please link the trademark registration.',
    );
    expect(s.myApplication('hawker')?.status).toBe('INFO_REQUESTED');
    s.applyPartner('hawker', {
      ...application,
      type: 'BRAND',
      website: 'https://h.example',
      proofUrl: 'https://h.example/tm',
    } as ApplicationInput);
    expect(s.myApplication('hawker')?.status).toBe('SUBMITTED');
  });
});

describe('partner campaigns', () => {
  it('Σ units must equal capacity (422) and dates must be in order', () => {
    const s = make();
    expect(codeOf(() => s.saveDraftCampaign('kopi', campaign({ capacity: 11 })))).toBe(
      'VALIDATION_FAILED:422',
    );
    const now = Date.now();
    expect(
      codeOf(() => s.saveDraftCampaign('kopi', campaign({ starts_at: now + 1000, ends_at: now }))),
    ).toBe('INVALID_DATES:400');
  });
  it('partner A cannot read, edit or submit partner B’s campaign (IDOR)', () => {
    const s = make();
    expect(codeOf(() => s.campaignDraft('kopi', 'astral'))).toBe('NOT_FOUND:404');
    expect(codeOf(() => s.saveDraftCampaign('kopi', campaign({ campaignId: 'astral' })))).toBe(
      'FORBIDDEN:403',
    );
    expect(codeOf(() => s.submitCampaign('business', 'kopi-kaki-s1'))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.campaignDraft('collector', 'kopi-kaki-s1'))).toBe('NOT_FOUND:404');
    expect(codeOf(() => s.saveDraftCampaign('collector', campaign()))).toBe('BUSINESS_ONLY:403');
    expect(codeOf(() => s.analytics('kopi', 'astral'))).toBe('FORBIDDEN:403');
    expect(codeOf(() => s.manifest('kopi', 'astral'))).toBe('FORBIDDEN:403');
    // Drafts are invisible to the public snapshot.
    expect(codeOf(() => s.snapshot(null, 'kopi-kaki-s1'))).toBe('NOT_FOUND:404');
    expect(s.publicCampaigns().map((c) => c.id)).not.toContain('kopi-kaki-s1');
  });
  it('after publish the counts, price and capacity are locked (409 LOCKED_AFTER_LIVE)', () => {
    const s = make();
    const { userId, campaignId } = launch(s);
    expect(codeOf(() => s.saveDraftCampaign(userId, campaign({ campaignId, price: 900 })))).toBe(
      'LOCKED_AFTER_LIVE:409',
    );
    expect(codeOf(() => s.submitCampaign(userId, campaignId))).toBe('INVALID_STATE:409');
  });
  it('a published partner drop is public, playable and sold from its own committed pool', () => {
    const s = make();
    const { userId, campaignId } = launch(s);
    expect(s.publicCampaigns().map((c) => c.id)).toContain(campaignId);
    expect(s.verification(campaignId).revealed).toBe(false);
    const snap = s.snapshot(s.user('collector'), campaignId);
    expect(snap.characters.filter((c) => c.campaign_id === campaignId)).toHaveLength(3);
    const win = s.demoWin('collector', campaignId);
    const { allocationId } = s.preorder('collector', win.accessId);
    const box = s.one<{ campaign_id: string; position: number }>(
      'SELECT a.campaign_id,p.position FROM allocations a JOIN pool_units p ON p.id=a.pool_unit_id WHERE a.id=?',
      allocationId,
    )!;
    expect(box).toEqual({ campaign_id: campaignId, position: 0 });
    // Dashboard formulas (AGENTS.md section 14) on this fixture.
    const d = s.partnerDashboard(userId).campaigns[0];
    expect(d).toMatchObject({
      plays: 1,
      wins: 1,
      winRate: 100,
      paid: 1,
      sellThrough: 10,
      revenue: 1500,
      partnerShare: 450,
      hasPool: true,
    });
    expect(s.manifest(userId, campaignId).total).toBe(1);
  });
  it('seeds Kopi Kaki Collective with a draft and Hawker Heroes with a submitted application', () => {
    const s = make();
    expect(s.campaignDraft('kopi', 'kopi-kaki-s1').characters).toHaveLength(5);
    expect(s.applications('admin').find((a) => a.id === 'app-hawker')?.status).toBe('SUBMITTED');
  });
});
