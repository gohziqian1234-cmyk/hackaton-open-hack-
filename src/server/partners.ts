// B2B partner portal (AGENTS.md sections 5, 6, 14). Every method checks role and membership.
import { randomBytes, randomUUID } from 'node:crypto';
import { DomainError } from './errors';
import { Loopbox } from './service';
import { partnerShareCents, revenueCents, sellThrough, winRate } from '../domain/metrics';
import type { CampaignInput, ApplicationInput } from './validation';

export type Application = {
  id: string;
  user_id: string;
  type: 'BRAND' | 'COLLECTIVE';
  org_name: string;
  contact_email: string;
  website: string | null;
  proof_url: string | null;
  portfolio_url: string | null;
  members_count: number | null;
  proposed_series: string;
  ip_statement: string;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED';
  admin_note: string | null;
  partner_id: string | null;
  created_at: number;
  decided_at: number | null;
};
const LIVE = ['UPCOMING', 'ACTIVE_PREORDER', 'PREORDER_CLOSED', 'TRADE_WINDOW', 'ALLOCATION_LOCKED', 'IN_PRODUCTION', 'SHIPPING', 'COMPLETED'];

export class Partners extends Loopbox {
  /** Any signed-in user may apply. One open application at a time; INFO_REQUESTED is edited in place. */
  applyPartner(userId: string, input: ApplicationInput) {
    const user = this.user(userId);
    if (user.role === 'ADMIN') throw new DomainError('FORBIDDEN', 403);
    if (this.one('SELECT 1 FROM partner_members WHERE user_id=?', userId))
      throw new DomainError('ALREADY_DONE');
    return this.transaction(() => {
      const open = this.one<{ id: string; status: string }>(
        "SELECT id,status FROM partner_applications WHERE user_id=? AND status IN ('SUBMITTED','INFO_REQUESTED') ORDER BY created_at DESC LIMIT 1",
        userId,
      );
      if (open?.status === 'SUBMITTED') throw new DomainError('ALREADY_DONE');
      const brand = input.type === 'BRAND';
      const fields = [
        input.type,
        input.orgName,
        input.contactEmail,
        brand ? input.website : null,
        brand ? input.proofUrl : null,
        brand ? null : input.portfolioUrl,
        brand ? null : input.membersCount,
        input.proposedSeries,
        input.ipStatement,
      ];
      const id = open?.id ?? randomUUID();
      if (open)
        this.run(
          "UPDATE partner_applications SET type=?,org_name=?,contact_email=?,website=?,proof_url=?,portfolio_url=?,members_count=?,proposed_series=?,ip_statement=?,status='SUBMITTED',decided_at=NULL WHERE id=?",
          ...fields,
          id,
        );
      else
        this.run(
          "INSERT INTO partner_applications (id,user_id,type,org_name,contact_email,website,proof_url,portfolio_url,members_count,proposed_series,ip_statement,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'SUBMITTED',?)",
          id,
          userId,
          ...fields,
          this.now(),
        );
      this.audit(userId, open ? 'application.resubmitted' : 'application.submitted', 'application', id, {
        type: input.type,
      });
      return { applicationId: id };
    });
  }
  myApplication(userId: string) {
    return (
      this.one<Pick<Application, 'id' | 'status' | 'org_name' | 'type' | 'admin_note' | 'created_at'>>(
        'SELECT id,status,org_name,type,admin_note,created_at FROM partner_applications WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
        userId,
      ) ?? null
    );
  }
  applications(adminId: string) {
    this.admin(adminId);
    return this.all<Application>(
      "SELECT * FROM partner_applications ORDER BY CASE status WHEN 'SUBMITTED' THEN 0 WHEN 'INFO_REQUESTED' THEN 1 ELSE 2 END,created_at DESC LIMIT 100",
    );
  }
  /** APPROVE creates the partner, makes the applicant its OWNER and a BUSINESS user. */
  decideApplication(
    adminId: string,
    applicationId: string,
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_INFO',
    note = '',
  ) {
    this.admin(adminId);
    return this.transaction(() => {
      const app = this.one<Application>('SELECT * FROM partner_applications WHERE id=?', applicationId);
      if (!app) throw new DomainError('NOT_FOUND', 404);
      if (app.status !== 'SUBMITTED') throw new DomainError('INVALID_STATE');
      if (decision === 'REQUEST_INFO' && !note) throw new DomainError('VALIDATION_FAILED', 422);
      const status =
        decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'INFO_REQUESTED';
      let partnerId: string | null = null;
      if (decision === 'APPROVE') {
        partnerId = 'p-' + randomBytes(6).toString('hex');
        this.run(
          'INSERT INTO partners (id,name,type,owner_user_id,created_at) VALUES (?,?,?,?,?)',
          partnerId,
          app.org_name,
          app.type,
          app.user_id,
          this.now(),
        );
        this.run(
          "INSERT INTO partner_members (partner_id,user_id,role,created_at) VALUES (?,?,'OWNER',?)",
          partnerId,
          app.user_id,
          this.now(),
        );
        this.run("UPDATE users SET role='BUSINESS' WHERE id=? AND role='COLLECTOR'", app.user_id);
      }
      this.run(
        'UPDATE partner_applications SET status=?,admin_note=?,partner_id=?,decided_at=? WHERE id=?',
        status,
        note || null,
        partnerId,
        this.now(),
        app.id,
      );
      this.audit(adminId, 'application.' + status.toLowerCase(), 'application', app.id, { partnerId });
      return { status, partnerId };
    });
  }
  /** The partner this user belongs to, or null. */
  myPartner(userId: string) {
    return (
      this.one<{ id: string; name: string; type: string; role: string }>(
        'SELECT p.id,p.name,p.type,m.role FROM partner_members m JOIN partners p ON p.id=m.partner_id WHERE m.user_id=? ORDER BY m.created_at LIMIT 1',
        userId,
      ) ?? null
    );
  }
  /** Dashboard formulas: AGENTS.md section 14. Only the partner's own campaigns. */
  partnerDashboard(userId: string) {
    const user = this.user(userId);
    if (user.role !== 'BUSINESS') throw new DomainError('BUSINESS_ONLY', 403);
    const partner = this.myPartner(userId);
    if (!partner) throw new DomainError('FORBIDDEN', 403);
    const campaigns = this.all<{
      id: string;
      name: string;
      phase: string;
      price: number;
      capacity: number;
      revenue_share_bps: number;
      starts_at: number;
    }>(
      'SELECT id,name,phase,price,capacity,revenue_share_bps,starts_at FROM campaigns WHERE partner_id=? ORDER BY created_at DESC,id',
      partner.id,
    );
    return {
      partner,
      campaigns: campaigns.map((c) => {
        const n = (sql: string) => this.one<{ n: number }>(sql, c.id)!.n;
        const plays = n('SELECT COUNT(*) AS n FROM game_sessions WHERE campaign_id=?');
        const wins = n('SELECT COUNT(*) AS n FROM game_sessions WHERE campaign_id=? AND won=1');
        const paid = n("SELECT COUNT(*) AS n FROM orders WHERE campaign_id=? AND status IN ('PAID','DEMO_PAID')");
        const trades = n("SELECT COUNT(*) AS n FROM matches WHERE campaign_id=? AND status='ACCEPTED'");
        const revenue = revenueCents(paid, c.price);
        return {
          ...c,
          plays,
          wins,
          winRate: winRate(wins, plays),
          paid,
          sellThrough: sellThrough(paid, c.capacity),
          trades,
          revenue,
          partnerShare: partnerShareCents(revenue, c.revenue_share_bps),
          hasPool: !!this.one('SELECT 1 FROM pool_units WHERE campaign_id=? LIMIT 1', c.id),
        };
      }),
    };
  }
  /** Read a campaign for editing. Other partners get 404 so ids cannot be probed. */
  campaignDraft(userId: string, campaignId: string) {
    const user = this.user(userId);
    const c = this.one<Record<string, unknown> & { id: string; phase: string }>(
      'SELECT * FROM campaigns WHERE id=?',
      campaignId,
    );
    if (!c || (user.role !== 'ADMIN' && !this.isMember(userId, campaignId)))
      throw new DomainError('NOT_FOUND', 404);
    return {
      campaign: c,
      characters: this.all<{ id: string; name: string; rarity: string; units: number; color: string; description: string }>(
        'SELECT id,name,rarity,units,color,description FROM characters WHERE campaign_id=? ORDER BY rowid',
        c.id,
      ),
      editable: c.phase === 'DRAFT',
    };
  }
  private checkCampaign(input: CampaignInput) {
    if (input.characters.reduce((n, ch) => n + ch.units, 0) !== input.capacity)
      throw new DomainError('VALIDATION_FAILED', 422);
    if (!(input.starts_at < input.ends_at && input.ends_at <= input.trade_ends_at))
      throw new DomainError('INVALID_DATES', 400);
    const names = input.characters.map((ch) => ch.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new DomainError('VALIDATION_FAILED', 422);
  }
  /** Create or update a DRAFT. Counts, price and capacity are locked once live (409). */
  saveDraftCampaign(userId: string, input: CampaignInput) {
    const user = this.user(userId);
    if (user.role !== 'BUSINESS') throw new DomainError('BUSINESS_ONLY', 403);
    const partner = this.myPartner(userId);
    if (!partner) throw new DomainError('FORBIDDEN', 403);
    this.checkCampaign(input);
    return this.transaction(() => {
      let id = input.campaignId;
      if (id) {
        const c = this.one<{ phase: string; partner_id: string }>(
          'SELECT phase,partner_id FROM campaigns WHERE id=?',
          id,
        );
        if (!c || !this.isMember(userId, id)) throw new DomainError('FORBIDDEN', 403);
        if (LIVE.includes(c.phase)) throw new DomainError('LOCKED_AFTER_LIVE');
        if (c.phase !== 'DRAFT') throw new DomainError('INVALID_STATE');
        this.run(
          'UPDATE campaigns SET name=?,description=?,price=?,capacity=?,max_per_user=?,starts_at=?,ends_at=?,trade_ends_at=?,game_mode=?,required_score=?,attempts_per_day=? WHERE id=?',
          input.name,
          input.description,
          input.price,
          input.capacity,
          input.max_per_user,
          input.starts_at,
          input.ends_at,
          input.trade_ends_at,
          input.game_mode,
          input.required_score,
          input.attempts_per_day,
          id,
        );
        this.run('DELETE FROM characters WHERE campaign_id=?', id);
      } else {
        const slug = input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40);
        id = (slug || 'series') + '-' + randomBytes(3).toString('hex');
        this.run(
          "INSERT INTO campaigns (id,partner_id,name,description,price,capacity,max_per_user,phase,starts_at,ends_at,trade_ends_at,game_mode,required_score,attempts_per_day,created_at) VALUES (?,?,?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?)",
          id,
          partner.id,
          input.name,
          input.description,
          input.price,
          input.capacity,
          input.max_per_user,
          input.starts_at,
          input.ends_at,
          input.trade_ends_at,
          input.game_mode,
          input.required_score,
          input.attempts_per_day,
          this.now(),
        );
      }
      input.characters.forEach((ch, i) =>
        this.run(
          'INSERT INTO characters (id,campaign_id,name,rarity,weight,units,color,description) VALUES (?,?,?,?,1,?,?,?)',
          `${id}-${i + 1}`,
          id,
          ch.name,
          ch.rarity,
          ch.units,
          ch.color,
          ch.description,
        ),
      );
      this.audit(userId, 'campaign.draft_saved', 'campaign', id!, { characters: input.characters.length });
      return { campaignId: id! };
    });
  }
  /** DRAFT → IN_REVIEW. The admin then publishes it. */
  submitCampaign(userId: string, campaignId: string) {
    const user = this.user(userId);
    if (user.role !== 'BUSINESS') throw new DomainError('BUSINESS_ONLY', 403);
    return this.transaction(() => {
      const c = this.one<{ phase: string; capacity: number }>(
        'SELECT phase,capacity FROM campaigns WHERE id=?',
        campaignId,
      );
      if (!c || !this.isMember(userId, campaignId)) throw new DomainError('FORBIDDEN', 403);
      if (c.phase !== 'DRAFT') throw new DomainError('INVALID_STATE');
      const units = this.one<{ n: number; chars: number }>(
        'SELECT COALESCE(SUM(units),0) AS n,COUNT(*) AS chars FROM characters WHERE campaign_id=?',
        campaignId,
      )!;
      if (units.n !== c.capacity || units.chars < 2) throw new DomainError('VALIDATION_FAILED', 422);
      this.run("UPDATE campaigns SET phase='IN_REVIEW' WHERE id=?", campaignId);
      this.audit(userId, 'campaign.submitted', 'campaign', campaignId, {});
      return { phase: 'IN_REVIEW' };
    });
  }
}
