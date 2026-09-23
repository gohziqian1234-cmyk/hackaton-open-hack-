import { randomUUID, randomInt } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { lore, phases, questConfig } from '../lib/catalog';
import { scoreRun } from '../lib/game';
import { startOfSgtDay } from '../domain/time';
import { winRate } from '../domain/metrics';
import { buildPool, commitment, shuffle, verify } from '../domain/fairness';
import { DEMO_SEED_HEX } from './seed';
import {
  SESSION_MINUTES,
  createCheckoutSession,
  expireCheckoutSession,
  paymentMode,
  refundPaymentIntent,
  simulateAllowed,
} from './stripe';
import type {
  Allocation,
  Campaign,
  User,
  Snapshot,
  Match,
  Access,
  Analytics,
  Verification,
  OrderSummary,
} from '../lib/types';

import { DomainError } from './errors';
export { DomainError };
/** Order statuses that hold a seat against capacity. */
const ACTIVE = "('PENDING_PAYMENT','PAID','DEMO_PAID')";
export type PaymentSession = {
  id: string;
  payment_status?: string | null;
  payment_intent?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
};
export type PaymentEvent = { id: string; type: string; session: PaymentSession };
type GameSession = {
  id: string;
  user_id: string;
  mode: string;
  started_at: number;
  completed_at: number | null;
  seed: number;
};
export class Loopbox {
  constructor(
    public db: DatabaseSync,
    private now = () => Date.now(),
    public demo = process.env.DEMO_MODE !== 'false',
  ) {}
  one<T>(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }
  all<T>(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).all(...args) as T[];
  }
  run(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).run(...args);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  campaign() {
    return this.one<Campaign>(
      `SELECT c.*, (SELECT COUNT(*) FROM orders WHERE campaign_id=c.id AND status IN ${ACTIVE}) AS confirmed FROM campaigns c WHERE id=?`,
      'astral',
    )!;
  }
  user(id: string) {
    const user = this.one<User>('SELECT id,name,role FROM users WHERE id=?', id);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    return user;
  }
  business(id: string) {
    if (this.user(id).role !== 'BUSINESS') throw new DomainError('BUSINESS_ONLY', 403);
  }
  collector(id: string) {
    if (this.user(id).role !== 'COLLECTOR') throw new DomainError('COLLECTOR_ONLY', 403);
  }
  purchases(id: string) {
    return this.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM orders WHERE user_id=? AND campaign_id=? AND status IN ${ACTIVE}`,
      id,
      'astral',
    )!.n;
  }
  eligible(id: string) {
    this.collector(id);
    const c = this.campaign();
    if (c.phase !== 'ACTIVE_PREORDER' || this.now() < c.starts_at || this.now() >= c.ends_at)
      throw new DomainError('PREORDER_CLOSED');
    if (c.confirmed >= c.capacity) throw new DomainError('SOLD_OUT');
    if (this.purchases(id) >= c.max_per_user) throw new DomainError('PURCHASE_LIMIT');
    return c;
  }
  login(id: 'collector' | 'business' | 'demo-0') {
    if (!this.demo) throw new DomainError('DEMO_DISABLED', 403);
    this.user(id);
    const token = randomUUID();
    this.run('INSERT INTO sessions VALUES (?,?,?)', token, id, this.now() + 86400000);
    return token;
  }
  identity(token?: string) {
    return token
      ? (this.one<User>(
          'SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE token=? AND expires_at>?',
          token,
          this.now(),
        ) ?? null)
      : null;
  }
  /** Daily play limit per campaign. Demo mode allows 50 so rehearsals never lock anyone out. */
  attemptLimit(c: Campaign) {
    return this.demo ? 50 : c.attempts_per_day;
  }
  attemptsUsed(id: string, campaignId: string) {
    return this.one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM game_sessions WHERE user_id=? AND campaign_id=? AND started_at>=?',
      id,
      campaignId,
      startOfSgtDay(this.now()),
    )!.n;
  }
  private checkAttempts(id: string, c: Campaign) {
    if (this.attemptsUsed(id, c.id) >= this.attemptLimit(c))
      throw new DomainError('ATTEMPT_LIMIT', 429);
  }
  private grantAccess(id: string, campaignId: string, gameId: string) {
    const existing = this.one<Access>(
      "SELECT * FROM access WHERE user_id=? AND campaign_id=? AND status='AVAILABLE' AND expires_at>?",
      id,
      campaignId,
      this.now(),
    );
    if (existing) return existing.id;
    const accessId = randomUUID();
    this.run(
      'INSERT INTO access (id,user_id,campaign_id,game_id,earned_at,expires_at,status) VALUES (?,?,?,?,?,?,?)',
      accessId,
      id,
      campaignId,
      gameId,
      this.now(),
      this.now() + 15 * 60000,
      'AVAILABLE',
    );
    return accessId;
  }
  startGame(id: string, mode: 'run' | 'lore') {
    return this.transaction(() => {
      const c = this.eligible(id);
      this.checkAttempts(id, c);
      const recent = this.one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM game_sessions WHERE user_id=? AND started_at>?',
        id,
        this.now() - 60000,
      )!.n;
      if (recent >= 10) throw new DomainError('TRY_AGAIN_SHORTLY', 429);
      const session = { id: randomUUID(), seed: randomInt(0, 10000), mode };
      this.run(
        'INSERT INTO game_sessions (id,user_id,campaign_id,mode,started_at,seed) VALUES (?,?,?,?,?,?)',
        session.id,
        id,
        'astral',
        mode,
        this.now(),
        session.seed,
      );
      return session;
    });
  }
  completeGame(id: string, sessionId: string, values: number[]) {
    return this.transaction(() => {
      const c = this.eligible(id);
      const g = this.one<GameSession>(
        'SELECT * FROM game_sessions WHERE id=? AND user_id=?',
        sessionId,
        id,
      );
      if (!g) throw new DomainError('INVALID_SESSION', 403);
      if (g.completed_at !== null) throw new DomainError('SESSION_ALREADY_USED');
      const elapsed = this.now() - g.started_at;
      if (elapsed > 3600000) throw new DomainError('SESSION_EXPIRED');
      if (
        g.mode === 'run' &&
        (elapsed < questConfig.duration * 1000 - 500 || values.length !== questConfig.waves)
      )
        throw new DomainError('INVALID_RUN', 400);
      if (g.mode === 'lore' && values.length !== lore.length)
        throw new DomainError('INCOMPLETE_CHALLENGE', 400);
      const score =
        g.mode === 'run'
          ? scoreRun(g.seed, values)
          : values.filter((v, i) => v === lore[i].answer).length;
      const won = g.mode === 'run' ? score >= c.required_score : score === lore.length;
      this.run(
        'UPDATE game_sessions SET completed_at=?,score=?,won=? WHERE id=?',
        this.now(),
        score,
        won ? 1 : 0,
        g.id,
      );
      if (!won) return { won: false, score };
      return { won: true, score, accessId: this.grantAccess(id, c.id, g.id) };
    });
  }
  /** DEMO_MODE only: records a winning session exactly like a real win, without playing. */
  demoWin(id: string) {
    if (!this.demo) throw new DomainError('NOT_FOUND', 404);
    return this.transaction(() => {
      const c = this.eligible(id);
      this.checkAttempts(id, c);
      const gameId = randomUUID();
      this.run(
        'INSERT INTO game_sessions (id,user_id,campaign_id,mode,started_at,completed_at,score,seed,won) VALUES (?,?,?,?,?,?,?,?,1)',
        gameId,
        id,
        c.id,
        'run',
        this.now(),
        this.now(),
        c.required_score,
        randomInt(0, 10000),
      );
      return { won: true, score: c.required_score, accessId: this.grantAccess(id, c.id, gameId) };
    });
  }
  audit(actorId: string | null, action: string, entity: string, entityId: string, detail = {}) {
    this.run(
      'INSERT INTO audit_log (id,actor_id,action,entity,entity_id,detail,created_at) VALUES (?,?,?,?,?,?,?)',
      randomUUID(),
      actorId,
      action,
      entity,
      entityId,
      JSON.stringify(detail),
      this.now(),
    );
  }
  /** Holds one seat: order PENDING_PAYMENT (counted by the capacity trigger), slot RESERVED. */
  private reserve(id: string, accessId: string) {
    const c = this.eligible(id);
    const a = this.one<Access & { user_id: string; campaign_id: string }>(
      'SELECT * FROM access WHERE id=?',
      accessId,
    );
    if (!a || a.user_id !== id || a.campaign_id !== c.id)
      throw new DomainError('INVALID_ACCESS', 403);
    if (a.status !== 'AVAILABLE') throw new DomainError('ACCESS_ALREADY_USED');
    if (a.expires_at <= this.now()) throw new DomainError('ACCESS_EXPIRED');
    const orderId = randomUUID();
    this.run(
      'INSERT INTO orders (id,user_id,campaign_id,access_id,amount,status,created_at) VALUES (?,?,?,?,?,?,?)',
      orderId,
      id,
      c.id,
      a.id,
      c.price,
      'PENDING_PAYMENT',
      this.now(),
    );
    this.run("UPDATE access SET status='RESERVED',order_id=? WHERE id=?", orderId, a.id);
    this.run(
      'INSERT INTO payments (id,kind,ref_id,user_id,amount_cents,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      randomUUID(),
      'B2C',
      orderId,
      id,
      c.price,
      'OPEN',
      this.now() + SESSION_MINUTES * 60000,
      this.now(),
      this.now(),
    );
    this.audit(id, 'order.created', 'order', orderId, { campaign: c.id, amount: c.price });
    return { orderId, campaign: c };
  }
  /** Step 1 of paying: reserve in one transaction, then create the Stripe session outside it. */
  async checkout(
    id: string,
    accessId: string,
    ageConfirmed: boolean,
    createSession: typeof createCheckoutSession = createCheckoutSession,
  ): Promise<{ url: string; orderId: string } | { simulated: true; orderId: string }> {
    if (ageConfirmed !== true) throw new DomainError('AGE_CONFIRMATION_REQUIRED', 400);
    const mode = paymentMode(this.demo);
    if (mode === 'unavailable') throw new DomainError('PAYMENTS_NOT_CONFIGURED', 503);
    const { orderId, campaign } = this.transaction(() => {
      this.run('UPDATE users SET age_confirmed_at=? WHERE id=?', this.now(), id);
      return this.reserve(id, accessId);
    });
    if (mode === 'simulated') return { simulated: true, orderId };
    try {
      const session = await createSession({
        kind: 'B2C',
        orderId,
        userId: id,
        refKey: 'campaign_id',
        refId: campaign.id,
        name: campaign.name + ' mystery box',
        unitAmountCents: campaign.price,
        quantity: 1,
        successPath: '/checkout/success?',
        cancelPath: '/checkout?cancelled=1',
      });
      this.run(
        "UPDATE payments SET stripe_session_id=?,expires_at=?,updated_at=? WHERE kind='B2C' AND ref_id=?",
        session.id,
        session.expiresAt,
        this.now(),
        orderId,
      );
      return { url: session.url, orderId };
    } catch (e) {
      this.transaction(() => this.release(orderId, 'session_failed'));
      throw e instanceof DomainError ? e : new DomainError('PAYMENT_UNAVAILABLE', 502);
    }
  }
  /** Gives the seat back. The slot returns to AVAILABLE only while its 15 minutes remain. */
  private release(orderId: string, reason: string) {
    const o = this.one<{ status: string; user_id: string; access_id: string }>(
      'SELECT status,user_id,access_id FROM orders WHERE id=?',
      orderId,
    );
    if (!o || o.status !== 'PENDING_PAYMENT') return false;
    this.run("UPDATE orders SET status='EXPIRED' WHERE id=?", orderId);
    this.run(
      "UPDATE payments SET status='EXPIRED',updated_at=? WHERE kind='B2C' AND ref_id=? AND status='OPEN'",
      this.now(),
      orderId,
    );
    this.run(
      "UPDATE access SET order_id=NULL,status=CASE WHEN expires_at>? THEN 'AVAILABLE' ELSE 'EXPIRED' END WHERE id=? AND status='RESERVED'",
      reason === 'cancelled' || reason === 'session_failed' ? this.now() : Number.MAX_SAFE_INTEGER,
      o.access_id,
    );
    this.audit(o.user_id, 'order.expired', 'order', orderId, { reason });
    return true;
  }
  /** Buyer came back from Stripe's cancel link: close the session and free the seat. */
  async cancelCheckout(id: string, expire: typeof expireCheckoutSession = expireCheckoutSession) {
    const pending = this.one<{ id: string; session: string | null }>(
      "SELECT o.id,p.stripe_session_id AS session FROM orders o JOIN payments p ON p.kind='B2C' AND p.ref_id=o.id WHERE o.user_id=? AND o.status='PENDING_PAYMENT' ORDER BY o.created_at DESC LIMIT 1",
      id,
    );
    if (!pending) return { cancelled: false };
    if (pending.session && paymentMode(this.demo) === 'stripe') {
      try {
        await expire(pending.session);
      } catch {
        // Already paid or already expired: let the webhook decide.
        return { cancelled: false };
      }
    }
    return { cancelled: this.transaction(() => this.release(pending.id, 'cancelled')) };
  }
  /** Marks a pending (or revivable) B2C order paid and allocates its box, in the caller's txn. */
  private settleB2C(orderId: string, session: PaymentSession, simulated: boolean) {
    const o = this.one<{ status: string; user_id: string; campaign_id: string; access_id: string }>(
      'SELECT status,user_id,campaign_id,access_id FROM orders WHERE id=?',
      orderId,
    );
    if (!o) return { outcome: 'ignored' as const };
    if (o.status === 'PAID' || o.status === 'DEMO_PAID' || o.status === 'REFUNDED')
      return { outcome: 'ignored' as const };
    const refund = () => {
      this.run("UPDATE orders SET status='REFUNDED' WHERE id=?", orderId);
      this.run(
        "UPDATE payments SET status='REFUNDED',payment_intent=?,updated_at=? WHERE kind='B2C' AND ref_id=?",
        session.payment_intent ?? null,
        this.now(),
        orderId,
      );
      this.audit(null, 'order.refunded', 'order', orderId, { reason: 'no_capacity' });
      return { outcome: 'refund' as const, paymentIntent: session.payment_intent ?? null };
    };
    if (o.status === 'EXPIRED') {
      // Paid after the seat was released: take it back only if a box is still free.
      const c = this.one<{ phase: string }>('SELECT phase FROM campaigns WHERE id=?', o.campaign_id);
      if (c?.phase !== 'ACTIVE_PREORDER') return refund();
      try {
        this.run("UPDATE orders SET status='PENDING_PAYMENT' WHERE id=?", orderId);
      } catch (e) {
        if (e instanceof Error && e.message.includes('SOLD_OUT')) return refund();
        throw e;
      }
    }
    try {
      this.run('SAVEPOINT allocate_unit');
      this.run("UPDATE orders SET status='PAID' WHERE id=?", orderId);
      const allocationId = this.allocate(orderId, o.user_id, o.campaign_id);
      this.run('RELEASE allocate_unit');
      this.run(
        "UPDATE payments SET status=?,payment_intent=?,stripe_session_id=COALESCE(stripe_session_id,?),paid_at=?,updated_at=? WHERE kind='B2C' AND ref_id=?",
        simulated ? 'SIMULATED' : 'PAID',
        session.payment_intent ?? null,
        session.id,
        this.now(),
        this.now(),
        orderId,
      );
      this.run("UPDATE access SET status='REDEEMED',order_id=? WHERE id=?", orderId, o.access_id);
      this.audit(o.user_id, 'order.paid', 'order', orderId, { simulated });
      this.audit(o.user_id, 'allocation.created', 'allocation', allocationId, { order: orderId });
      return { outcome: 'paid' as const, allocationId };
    } catch (e) {
      this.run('ROLLBACK TO allocate_unit');
      this.run('RELEASE allocate_unit');
      if (e instanceof DomainError && e.code === 'SOLD_OUT') return refund();
      throw e;
    }
  }
  /** Idempotent: a Stripe event id is processed at most once (webhook_events primary key). */
  processPaymentEvent(event: PaymentEvent, simulated = false) {
    return this.transaction(() => {
      const inserted = this.run(
        'INSERT OR IGNORE INTO webhook_events (id,type,received_at) VALUES (?,?,?)',
        event.id,
        event.type,
        this.now(),
      );
      if (Number(inserted.changes) === 0) return { outcome: 'duplicate' as const };
      const meta = event.session.metadata ?? {};
      const orderId = meta.order_id || event.session.client_reference_id || '';
      let result: { outcome: string; allocationId?: string; paymentIntent?: string | null } = {
        outcome: 'ignored',
      };
      if (meta.kind === 'C2C') result = this.settleMarket(event, orderId, simulated);
      else if (event.type === 'checkout.session.completed') {
        if (event.session.payment_status === 'paid')
          result = this.settleB2C(orderId, event.session, simulated);
      } else if (event.type === 'checkout.session.expired') {
        result = { outcome: this.release(orderId, 'session_expired') ? 'expired' : 'ignored' };
      }
      this.run('UPDATE webhook_events SET processed_at=? WHERE id=?', this.now(), event.id);
      return result;
    });
  }
  /** Processes an event, then (after commit) refunds a payment that could not get a box. */
  async handlePaymentEvent(
    event: PaymentEvent,
    refund: (paymentIntent: string) => Promise<void> = refundPaymentIntent,
  ) {
    const result = this.processPaymentEvent(event);
    if (result.outcome === 'refund' && 'paymentIntent' in result && result.paymentIntent) {
      try {
        await refund(result.paymentIntent);
        this.audit(null, 'refund.sent', 'order', event.session.client_reference_id ?? '', {});
      } catch {
        this.audit(null, 'refund.failed', 'order', event.session.client_reference_id ?? '', {});
      }
    }
    return result;
  }
  /** C2C settlement is added by the marketplace service (M8). */
  protected settleMarket(event: PaymentEvent, orderId: string, simulated: boolean) {
    void event;
    void orderId;
    void simulated;
    return { outcome: 'ignored' };
  }
  /** DEMO only: pays a pending order through the same handler Stripe's webhook uses. */
  simulatePayment(id: string, orderId: string, kind: 'B2C' | 'C2C' = 'B2C') {
    if (!simulateAllowed(this.demo)) throw new DomainError('NOT_FOUND', 404);
    const payment = this.one<{ user_id: string; stripe_session_id: string | null; status: string }>(
      'SELECT user_id,stripe_session_id,status FROM payments WHERE kind=? AND ref_id=?',
      kind,
      orderId,
    );
    if (!payment || payment.user_id !== id) throw new DomainError('NOT_FOUND', 404);
    if (payment.status !== 'OPEN') throw new DomainError('ALREADY_DONE');
    return this.processPaymentEvent(
      {
        id: 'sim_' + randomUUID(),
        type: 'checkout.session.completed',
        session: {
          id: payment.stripe_session_id ?? 'sim_session_' + orderId,
          payment_status: 'paid',
          payment_intent: null,
          client_reference_id: orderId,
          metadata: { kind, order_id: orderId },
        },
      },
      true,
    );
  }
  /** DEMO only: the original one-step demo purchase, now a reserve plus simulated payment. */
  preorder(id: string, accessId: string) {
    if (!this.demo) throw new DomainError('NOT_FOUND', 404);
    return this.transaction(() => {
      const { orderId } = this.reserve(id, accessId);
      const paid = this.settleB2C(
        orderId,
        { id: 'sim_session_' + orderId, payment_status: 'paid', payment_intent: null },
        true,
      );
      if (paid.outcome !== 'paid') throw new DomainError('SOLD_OUT');
      return { orderId, allocationId: paid.allocationId };
    });
  }
  /** Lazy expiry on read: unpaid orders past their session, unused slots past 15 minutes. */
  sweepExpired() {
    const now = this.now();
    const orders = this.all<{ id: string }>(
      "SELECT o.id FROM orders o JOIN payments p ON p.kind='B2C' AND p.ref_id=o.id WHERE o.status='PENDING_PAYMENT' AND p.expires_at<=?",
      now,
    );
    const slots = this.one("SELECT 1 FROM access WHERE status='AVAILABLE' AND expires_at<=? LIMIT 1", now);
    if (!orders.length && !slots) return;
    this.transaction(() => {
      for (const o of orders) this.release(o.id, 'session_expired');
      this.run("UPDATE access SET status='EXPIRED' WHERE status='AVAILABLE' AND expires_at<=?", now);
    });
  }
  /**
   * Gives an order the lowest unsold position in the committed shuffle. Must run inside the
   * caller's BEGIN IMMEDIATE transaction, which serialises writers, so no two orders can
   * take the same unit (also enforced by the unique pool_unit_id index).
   */
  allocate(orderId: string, userId: string, campaignId: string) {
    const unit = this.one<{ id: string; character_id: string }>(
      'SELECT id,character_id FROM pool_units WHERE campaign_id=? AND allocated=0 ORDER BY position LIMIT 1',
      campaignId,
    );
    if (!unit) throw new DomainError('SOLD_OUT');
    this.run('UPDATE pool_units SET allocated=1 WHERE id=? AND allocated=0', unit.id);
    const allocationId = randomUUID();
    this.run(
      'INSERT INTO allocations (id,order_id,campaign_id,owner_id,original_owner_id,character_id,status,revealed,created_at,pool_unit_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
      allocationId,
      orderId,
      campaignId,
      userId,
      userId,
      unit.character_id,
      'OWNED',
      0,
      this.now(),
      unit.id,
    );
    return allocationId;
  }
  /** Public fairness record. The seed and full order are only returned after preorders close. */
  verification(campaignId: string, userId?: string): Verification {
    const c = this.one<{ id: string; name: string; capacity: number }>(
      'SELECT id,name,capacity FROM campaigns WHERE id=?',
      campaignId,
    );
    const f = this.one<{
      commitment_hex: string;
      seed_hex: string;
      committed_at: number;
      revealed_at: number | null;
    }>('SELECT * FROM fairness_commitments WHERE campaign_id=?', campaignId);
    if (!c || !f) throw new DomainError('NOT_FOUND', 404);
    const units = this.all<{ id: string; name: string; units: number }>(
      'SELECT id,name,units FROM characters WHERE campaign_id=? ORDER BY rowid',
      campaignId,
    );
    const yourPositions = userId
      ? this.all<{ position: number }>(
          'SELECT p.position FROM allocations a JOIN pool_units p ON p.id=a.pool_unit_id WHERE a.campaign_id=? AND a.original_owner_id=? ORDER BY p.position',
          campaignId,
          userId,
        ).map((r) => r.position)
      : [];
    const base = {
      campaign: { id: c.id, name: c.name, capacity: c.capacity },
      characters: units,
      commitment: f.commitment_hex,
      committedAt: f.committed_at,
      revealed: f.revealed_at !== null,
      revealedAt: f.revealed_at,
      yourPositions,
      demoNote: this.demo && f.seed_hex === DEMO_SEED_HEX,
      sold: this.one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM pool_units WHERE campaign_id=? AND allocated=1',
        campaignId,
      )!.n,
    };
    if (f.revealed_at === null) return base;
    const order = this.all<{ character_id: string }>(
      'SELECT character_id FROM pool_units WHERE campaign_id=? ORDER BY position',
      campaignId,
    ).map((r) => r.character_id);
    const recomputed = shuffle(
      buildPool(
        units.map((u) => ({ id: u.id, units: u.units })),
        c.capacity,
      ),
      f.seed_hex,
    );
    return {
      ...base,
      seed: f.seed_hex,
      order,
      serverCheck: {
        recomputedCommitment: commitment(f.seed_hex, recomputed),
        orderMatches: recomputed.join(',') === order.join(','),
        fingerprintMatches: verify(f.seed_hex, order, f.commitment_hex),
      },
    };
  }
  owned(id: string, allocationId: string) {
    const a = this.one<Allocation>(
      'SELECT * FROM allocations WHERE id=? AND owner_id=?',
      allocationId,
      id,
    );
    if (!a) throw new DomainError('ALLOCATION_NOT_FOUND', 404);
    return a;
  }
  reveal(id: string, allocationId: string) {
    const a = this.owned(id, allocationId);
    this.run('UPDATE allocations SET revealed=1 WHERE id=?', a.id);
    return { ...a, revealed: 1 };
  }
  trading() {
    const c = this.campaign();
    if (
      !['ACTIVE_PREORDER', 'PREORDER_CLOSED', 'TRADE_WINDOW'].includes(c.phase) ||
      this.now() >= c.trade_ends_at
    )
      throw new DomainError('TRADE_WINDOW_CLOSED');
  }
  listTrade(id: string, allocationId: string, wants: string[]) {
    return this.transaction(() => {
      this.trading();
      const a = this.owned(id, allocationId);
      if (!a.revealed) throw new DomainError('OPEN_BOX_FIRST');
      if (!['OWNED', 'TRADE_LISTED'].includes(a.status))
        throw new DomainError('ALLOCATION_UNAVAILABLE');
      const source = this.one<{ rarity: string; campaign_id: string }>(
        'SELECT * FROM characters WHERE id=?',
        a.character_id,
      )!;
      for (const want of wants) {
        const target = this.one<{ rarity: string; campaign_id: string }>(
          'SELECT * FROM characters WHERE id=?',
          want,
        );
        if (
          !target ||
          target.rarity !== source.rarity ||
          target.campaign_id !== source.campaign_id ||
          want === a.character_id
        )
          throw new DomainError('SAME_RARITY_REQUIRED', 400);
      }
      this.run('DELETE FROM preferences WHERE allocation_id=?', a.id);
      for (const want of new Set(wants))
        this.run('INSERT INTO preferences VALUES (?,?)', a.id, want);
      this.run("UPDATE allocations SET status='TRADE_LISTED' WHERE id=?", a.id);
      const partner = this.one<Allocation>(
        `SELECT b.* FROM allocations b JOIN characters cb ON cb.id=b.character_id WHERE b.owner_id<>? AND b.campaign_id=? AND b.status='TRADE_LISTED' AND b.revealed=1 AND cb.rarity=? AND EXISTS(SELECT 1 FROM preferences WHERE allocation_id=? AND character_id=b.character_id) AND EXISTS(SELECT 1 FROM preferences WHERE allocation_id=b.id AND character_id=?) ORDER BY b.created_at,b.id LIMIT 1`,
        id,
        source.campaign_id,
        source.rarity,
        a.id,
        a.character_id,
      );
      if (!partner) return { matched: false };
      const matchId = randomUUID();
      this.run(
        'INSERT INTO matches VALUES (?,?,?,?,?,?,?,?,?,?)',
        matchId,
        source.campaign_id,
        a.id,
        partner.id,
        id,
        partner.owner_id,
        0,
        this.demo && partner.owner_id === 'demo-0' ? 1 : 0,
        'PENDING',
        this.now(),
      );
      this.run("UPDATE allocations SET status='TRADE_PENDING' WHERE id IN (?,?)", a.id, partner.id);
      return { matched: true, matchId };
    });
  }
  cancelListing(id: string, allocationId: string) {
    return this.transaction(() => {
      this.trading();
      const a = this.owned(id, allocationId);
      if (a.status === 'TRADE_PENDING' || a.status === 'LOCKED_FOR_PRODUCTION')
        throw new DomainError('ALLOCATION_UNAVAILABLE');
      this.run('DELETE FROM preferences WHERE allocation_id=?', a.id);
      this.run("UPDATE allocations SET status='OWNED' WHERE id=?", a.id);
      return { ok: true };
    });
  }
  respond(id: string, matchId: string, accept: boolean) {
    return this.transaction(() => {
      this.trading();
      const m = this.one<Match>(
        'SELECT * FROM matches WHERE id=? AND (a_user=? OR b_user=?)',
        matchId,
        id,
        id,
      );
      if (!m) throw new DomainError('MATCH_NOT_FOUND', 404);
      if (m.status !== 'PENDING') throw new DomainError('MATCH_ALREADY_RESOLVED');
      if (!accept) {
        this.run("UPDATE matches SET status='DECLINED' WHERE id=?", m.id);
        this.run("UPDATE allocations SET status='OWNED' WHERE id IN (?,?)", m.a_id, m.b_id);
        this.run('DELETE FROM preferences WHERE allocation_id IN (?,?)', m.a_id, m.b_id);
        return { status: 'DECLINED' };
      }
      this.run(
        `UPDATE matches SET ${id === m.a_user ? 'a_accept' : 'b_accept'}=1 WHERE id=?`,
        m.id,
      );
      const updated = this.one<Match>('SELECT * FROM matches WHERE id=?', m.id)!;
      if (updated.a_accept && updated.b_accept) {
        const a = this.owned(m.a_user, m.a_id),
          b = this.owned(m.b_user, m.b_id);
        if (a.status !== 'TRADE_PENDING' || b.status !== 'TRADE_PENDING')
          throw new DomainError('ALLOCATION_UNAVAILABLE');
        this.run("UPDATE allocations SET owner_id=?,status='OWNED' WHERE id=?", m.b_user, a.id);
        this.run("UPDATE allocations SET owner_id=?,status='OWNED' WHERE id=?", m.a_user, b.id);
        this.run('DELETE FROM preferences WHERE allocation_id IN (?,?)', a.id, b.id);
        this.run("UPDATE matches SET status='ACCEPTED' WHERE id=?", m.id);
        return { status: 'ACCEPTED' };
      }
      return { status: 'PENDING' };
    });
  }
  advance(id: string) {
    this.business(id);
    return this.transaction(() => {
      const c = this.campaign();
      const next = phases[phases.indexOf(c.phase) + 1];
      if (!next) throw new DomainError('CAMPAIGN_COMPLETE');
      if (next === 'PREORDER_CLOSED')
        this.run(
          'UPDATE fairness_commitments SET revealed_at=? WHERE campaign_id=? AND revealed_at IS NULL',
          this.now(),
          c.id,
        );
      if (next === 'ALLOCATION_LOCKED') {
        this.run("UPDATE matches SET status='EXPIRED' WHERE status='PENDING'");
        this.run('DELETE FROM preferences');
        this.run("UPDATE allocations SET status='LOCKED_FOR_PRODUCTION' WHERE campaign_id=?", c.id);
      }
      this.run('UPDATE campaigns SET phase=? WHERE id=?', next, c.id);
      return { phase: next };
    });
  }
  edit(
    id: string,
    changes: {
      name: string;
      description: string;
      price: number;
      capacity: number;
      max_per_user: number;
      starts_at: number;
      ends_at: number;
      trade_ends_at: number;
      weights: number[];
      required_score?: number;
      attempts_per_day?: number;
    },
  ) {
    this.business(id);
    return this.transaction(() => {
      const c = this.campaign();
      if (!['UPCOMING', 'ACTIVE_PREORDER'].includes(c.phase))
        throw new DomainError('CAMPAIGN_NOT_EDITABLE');
      if (changes.capacity < c.confirmed) throw new DomainError('CAP_BELOW_CONFIRMED');
      const pool = this.one<{ n: number }>(
        'SELECT COUNT(*) AS n FROM pool_units WHERE campaign_id=?',
        c.id,
      )!.n;
      if (pool > 0 && changes.capacity > pool) throw new DomainError('LOCKED_AFTER_LIVE');
      if (changes.starts_at >= changes.ends_at || changes.ends_at > changes.trade_ends_at)
        throw new DomainError('INVALID_DATES', 400);
      this.run(
        'UPDATE campaigns SET name=?,description=?,price=?,capacity=?,max_per_user=?,starts_at=?,ends_at=?,trade_ends_at=? WHERE id=?',
        changes.name,
        changes.description,
        changes.price,
        changes.capacity,
        changes.max_per_user,
        changes.starts_at,
        changes.ends_at,
        changes.trade_ends_at,
        c.id,
      );
      if (changes.required_score !== undefined || changes.attempts_per_day !== undefined)
        this.run(
          'UPDATE campaigns SET required_score=?,attempts_per_day=? WHERE id=?',
          changes.required_score ?? c.required_score,
          changes.attempts_per_day ?? c.attempts_per_day,
          c.id,
        );
      this.all<{ id: string }>('SELECT id FROM characters ORDER BY rowid').forEach((ch, i) =>
        this.run('UPDATE characters SET weight=? WHERE id=?', changes.weights[i], ch.id),
      );
      return { ok: true };
    });
  }
  snapshot(user: User | null): Snapshot {
    this.sweepExpired();
    const c = this.campaign();
    const id = user?.id ?? '';
    return {
      serverTime: this.now(),
      campaign: c,
      weights: this.all<{ weight: number }>(
        'SELECT weight FROM characters WHERE campaign_id=? ORDER BY rowid',
        c.id,
      ).map((row) => row.weight),
      user,
      demo: this.demo,
      purchases: this.purchases(id),
      access: this.all<Access>(
        "SELECT id,expires_at,status FROM access WHERE user_id=? AND status='AVAILABLE' AND expires_at>?",
        id,
        this.now(),
      ),
      collection: this.all<Allocation>(
        "SELECT a.id,CASE WHEN a.revealed=1 THEN a.character_id ELSE '' END AS character_id,a.owner_id,a.status,a.revealed,a.order_id,p.position FROM allocations a LEFT JOIN pool_units p ON p.id=a.pool_unit_id WHERE a.owner_id=? ORDER BY a.created_at DESC,a.id",
        id,
      ),
      matches: this.all<Match>(
        `SELECT m.*,a.character_id AS offered,b.character_id AS requested,u.name AS partner FROM matches m JOIN allocations a ON a.id=m.a_id JOIN allocations b ON b.id=m.b_id JOIN users u ON u.id=CASE WHEN m.a_user=? THEN m.b_user ELSE m.a_user END WHERE m.a_user=? OR m.b_user=? ORDER BY m.created_at DESC`,
        id,
        id,
        id,
      ),
      waitlisted: !!this.one('SELECT user_id FROM waitlist WHERE user_id=?', id),
      orders: this.all<OrderSummary>(
        "SELECT o.id,o.status,o.created_at,a.id AS allocation_id,p.stripe_session_id AS session_id,p.expires_at FROM orders o LEFT JOIN allocations a ON a.order_id=o.id LEFT JOIN payments p ON p.kind='B2C' AND p.ref_id=o.id WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 10",
        id,
      ),
      payment: { mode: paymentMode(this.demo), simulate: simulateAllowed(this.demo) },
      attemptLimit: this.attemptLimit(c),
      attemptsLeft: Math.max(0, this.attemptLimit(c) - this.attemptsUsed(id, c.id)),
    };
  }
  analytics(id: string): Analytics {
    this.business(id);
    const count = (sql: string) => this.one<{ n: number }>(sql)!.n;
    const c = this.campaign();
    const plays = count('SELECT COUNT(*) AS n FROM game_sessions'),
      wins = count('SELECT COUNT(*) AS n FROM game_sessions WHERE won=1');
    const paid = this.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders WHERE campaign_id=? AND status IN ('PAID','DEMO_PAID')",
      c.id,
    )!.n;
    return {
      orders: paid,
      plays,
      wins,
      winRate: winRate(wins, plays),
      players: count('SELECT COUNT(DISTINCT user_id) AS n FROM game_sessions'),
      completions: count('SELECT COUNT(*) AS n FROM game_sessions WHERE completed_at IS NOT NULL'),
      unlocks: count('SELECT COUNT(*) AS n FROM access'),
      opened: count('SELECT COUNT(*) AS n FROM allocations WHERE revealed=1'),
      listings: count(
        "SELECT COUNT(*) AS n FROM allocations WHERE status IN ('TRADE_LISTED','TRADE_PENDING')",
      ),
      trades: count("SELECT COUNT(*) AS n FROM matches WHERE status='ACCEPTED'"),
      distribution: this.all(
        'SELECT c.id,c.name,c.rarity,COUNT(a.id) AS quantity FROM characters c LEFT JOIN allocations a ON a.character_id=c.id GROUP BY c.id ORDER BY c.rowid',
      ),
    };
  }
}
