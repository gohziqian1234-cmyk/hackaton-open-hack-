// v2 Drops: theme browser data on top of the campaign engine (service → partners → market).
import { randomUUID } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import type { User, ThemeInfo, Snapshot, OrderItem } from '../lib/types';
import { DomainError } from './errors';
import { Market } from './market';
import { HELD_STATES, heldItemsSql } from './service';
import { SESSION_MINUTES, createCheckoutSession, paymentMode } from './stripe';

type ItemRow = {
  id: string;
  user_id: string;
  campaign_id: string;
  access_id: string;
  pool_unit_id: string;
  character_id: string;
  state: OrderItem['state'];
  reserved_until: number;
  payment_mode: 'stripe' | 'demo' | null;
};
const PENDING_FOR_ITEM =
  "EXISTS (SELECT 1 FROM item_orders io JOIN orders o ON o.id=io.order_id WHERE io.item_id=i.id AND o.status='PENDING_PAYMENT')";

type ThemeRow = {
  slug: string;
  name: string;
  status: 'live' | 'coming_soon';
  payment_mode: 'stripe' | 'demo' | null;
  is_licensed_concept: number;
  sort_order: number;
  tagline: string;
  description: string;
  accent: string;
  accent_secondary: string | null;
  cover_image: string | null;
  campaign_id: string | null;
  slot_hold_minutes: number;
  reservation_minutes: number;
  closes_at: number | null;
};
type CampaignRow = {
  id: string;
  name: string;
  description: string;
  phase: string;
  price: number;
  capacity: number;
  max_per_user: number;
  starts_at: number;
  ends_at: number;
  partner: string | null;
  claimed: number;
};
/** Default accent for partner campaigns that have no theme row. */
const PARTNER_ACCENT = '#5EEAD4';

export class Drops extends Market {
  /** Boxes a campaign has given out or holds for someone (counts against its cap). */
  protected claimedSql(alias: string) {
    return `((SELECT COUNT(*) FROM orders WHERE campaign_id=${alias}.id AND status IN ('PENDING_PAYMENT','PAID','DEMO_PAID')) + ${heldItemsSql(alias + '.id')})`;
  }
  /** Every theme card for /drops, in sort order, plus published partner campaigns without a theme. */
  themes(): ThemeInfo[] {
    const campaigns = new Map(
      this.all<CampaignRow>(
        `SELECT c.id,c.name,c.description,c.phase,c.price,c.capacity,c.max_per_user,c.starts_at,c.ends_at,p.name AS partner,${this.claimedSql('c')} AS claimed
         FROM campaigns c LEFT JOIN partners p ON p.id=c.partner_id
         WHERE c.phase NOT IN ('DRAFT','IN_REVIEW','CANCELLED') ORDER BY c.created_at,c.id`,
      ).map((c) => [c.id, c]),
    );
    const mixes = new Map<string, ThemeInfo['mix']>();
    for (const r of this.all<{ campaign_id: string; rarity: 'COMMON' | 'RARE' | 'SECRET'; n: number }>(
      'SELECT campaign_id,rarity,COUNT(*) AS n FROM characters GROUP BY campaign_id,rarity',
    )) {
      const mix = mixes.get(r.campaign_id) ?? { COMMON: 0, RARE: 0, SECRET: 0 };
      mix[r.rarity] = r.n;
      mixes.set(r.campaign_id, mix);
    }
    const empty = { COMMON: 0, RARE: 0, SECRET: 0 };
    const fromCampaign = (c: CampaignRow | undefined) => ({
      phase: c?.phase ?? null,
      price: c?.price ?? null,
      capacity: c?.capacity ?? null,
      claimed: c?.claimed ?? 0,
      max_per_user: c?.max_per_user ?? null,
      starts_at: c?.starts_at ?? null,
      mix: (c && mixes.get(c.id)) ?? empty,
      partner: c?.partner ?? null,
    });
    const themed = this.all<ThemeRow>('SELECT * FROM themes ORDER BY sort_order,slug').map(
      (t): ThemeInfo => {
        const c = t.campaign_id ? campaigns.get(t.campaign_id) : undefined;
        if (t.campaign_id) campaigns.delete(t.campaign_id);
        return {
          slug: t.slug,
          name: t.name,
          status: t.status === 'live' && c ? 'live' : 'coming_soon',
          payment_mode: t.payment_mode,
          licensed: t.is_licensed_concept === 1,
          sort_order: t.sort_order,
          tagline: t.tagline,
          description: t.description,
          accent: t.accent,
          accent_secondary: t.accent_secondary,
          cover: t.cover_image,
          campaign_id: c ? t.campaign_id : null,
          closes_at: c?.ends_at ?? t.closes_at,
          slot_hold_minutes: t.slot_hold_minutes,
          reservation_minutes: t.reservation_minutes,
          ...fromCampaign(c),
        };
      },
    );
    // Partner campaigns published through the portal appear after the seeded themes.
    const partnerDrops = [...campaigns.values()].map(
      (c, i): ThemeInfo => ({
        slug: c.id,
        name: c.name,
        status: 'live',
        payment_mode: 'stripe',
        licensed: false,
        sort_order: 1000 + i,
        tagline: c.partner ? `A drop by ${c.partner}.` : 'A partner drop.',
        description: c.description,
        accent: PARTNER_ACCENT,
        accent_secondary: null,
        cover: null,
        campaign_id: c.id,
        closes_at: c.ends_at,
        slot_hold_minutes: 15,
        reservation_minutes: 30,
        ...fromCampaign(c),
      }),
    );
    return [...themed, ...partnerDrops];
  }
  /** The theme card for a slug or a campaign id, or null. */
  theme(slugOrCampaign: string) {
    return (
      this.themes().find((t) => t.slug === slugOrCampaign || t.campaign_id === slugOrCampaign) ??
      null
    );
  }
  /** "Notify me" on a coming-soon theme. Idempotent per user and theme. */
  notifyTheme(userId: string, slug: string) {
    this.user(userId);
    const t = this.one<{ id: string; status: string }>('SELECT id,status FROM themes WHERE slug=?', slug);
    if (!t) throw new DomainError('NOT_FOUND', 404);
    if (t.status !== 'coming_soon') throw new DomainError('INVALID_STATE');
    this.run(
      'INSERT OR IGNORE INTO theme_interest (id,user_id,theme_id,created_at) VALUES (?,?,?,?)',
      randomUUID(),
      userId,
      t.id,
      this.now(),
    );
    return { ok: true };
  }
  interest(userId: string) {
    return this.all<{ slug: string }>(
      'SELECT t.slug FROM theme_interest i JOIN themes t ON t.id=i.theme_id WHERE i.user_id=? ORDER BY t.sort_order',
      userId,
    ).map((r) => r.slug);
  }
  protected ownedCampaignsSql() {
    return 'SELECT campaign_id FROM allocations WHERE owner_id=? UNION SELECT campaign_id FROM order_items WHERE user_id=?';
  }
  protected ownedCampaignsArgs(id: string): SQLInputValue[] {
    return [id, id];
  }

  /**
   * Opens a won slot: draws the lowest free position of the committed shuffle and holds it for
   * the drop's reservation window. The slot is consumed here, so it can never be opened (or
   * re-rolled) again. The character is returned before any animation plays.
   */
  openSlot(userId: string, accessId: string) {
    return this.transaction(() => {
      const a = this.one<{
        id: string;
        user_id: string;
        campaign_id: string;
        status: string;
        expires_at: number;
        earned_at: number;
      }>('SELECT * FROM access WHERE id=?', accessId);
      if (!a || a.user_id !== userId) {
        this.collector(userId);
        throw new DomainError('INVALID_ACCESS', 403);
      }
      if (a.status !== 'AVAILABLE') throw new DomainError('ACCESS_ALREADY_USED');
      if (a.expires_at <= this.now()) throw new DomainError('ACCESS_EXPIRED');
      const c = this.eligible(userId, a.campaign_id);
      const unit = this.one<{ id: string; character_id: string; position: number }>(
        `SELECT id,character_id,position FROM pool_units p WHERE campaign_id=? AND allocated=0 AND NOT EXISTS (SELECT 1 FROM order_items h WHERE h.pool_unit_id=p.id AND h.state IN ${HELD_STATES}) ORDER BY position LIMIT 1`,
        c.id,
      );
      if (!unit) throw new DomainError('SOLD_OUT');
      const theme = this.one<{ reservation_minutes: number; payment_mode: 'stripe' | 'demo' | null }>(
        'SELECT reservation_minutes,payment_mode FROM themes WHERE campaign_id=?',
        c.id,
      );
      const id = randomUUID();
      this.run(
        "INSERT INTO order_items (id,user_id,campaign_id,access_id,pool_unit_id,character_id,state,slot_won_at,opened_at,reserved_until,payment_mode,created_at) VALUES (?,?,?,?,?,?,'opened',?,?,?,?,?)",
        id,
        userId,
        c.id,
        a.id,
        unit.id,
        unit.character_id,
        a.earned_at,
        this.now(),
        this.now() + (theme?.reservation_minutes ?? 30) * 60000,
        theme?.payment_mode ?? 'stripe',
        this.now(),
      );
      this.run("UPDATE access SET status='REDEEMED' WHERE id=?", a.id);
      this.audit(userId, 'item.opened', 'order_item', id, { campaign: c.id, position: unit.position });
      return this.item(userId, id);
    });
  }
  /** One of the user's items, shaped for the client. */
  item(userId: string, itemId: string) {
    const item = this.items(userId, itemId)[0];
    if (!item) throw new DomainError('NOT_FOUND', 404);
    return item;
  }
  items(userId: string, itemId?: string): OrderItem[] {
    return this.all<Omit<OrderItem, 'pending'> & { pending: number }>(
      `SELECT i.id,i.campaign_id,t.slug AS theme_slug,i.character_id,i.state,i.opened_at,i.reserved_until,i.confirmed_at,i.payment_mode,i.order_id,i.allocation_id,p.position,c.price,
        ${PENDING_FOR_ITEM} AS pending,
        (SELECT io.basket_id FROM item_orders io WHERE io.item_id=i.id ORDER BY io.created_at DESC LIMIT 1) AS basket_id
       FROM order_items i JOIN pool_units p ON p.id=i.pool_unit_id JOIN campaigns c ON c.id=i.campaign_id LEFT JOIN themes t ON t.campaign_id=i.campaign_id
       WHERE i.user_id=? ${itemId ? 'AND i.id=?' : ''} ORDER BY i.opened_at DESC,i.id LIMIT 60`,
      ...(itemId ? [userId, itemId] : [userId]),
    ).map((r) => ({ ...r, pending: !!r.pending }));
  }
  private ownItem(userId: string, itemId: string) {
    const i = this.one<ItemRow>('SELECT * FROM order_items WHERE id=? AND user_id=?', itemId, userId);
    if (!i) throw new DomainError('NOT_FOUND', 404);
    return i;
  }
  /** Returns the figure to the pool. The slot stays used: no new draw, ever. */
  declineItem(userId: string, itemId: string) {
    this.sweepExpired();
    return this.transaction(() => {
      const i = this.ownItem(userId, itemId);
      if (i.state !== 'opened') throw new DomainError('ITEM_NOT_OPEN');
      if (this.one(`SELECT 1 FROM order_items i WHERE i.id=? AND ${PENDING_FOR_ITEM}`, i.id))
        throw new DomainError('PAYMENT_IN_PROGRESS');
      this.run(
        "UPDATE order_items SET state='declined',closed_at=? WHERE id=? AND state='opened'",
        this.now(),
        i.id,
      );
      this.audit(userId, 'item.declined', 'order_item', i.id, {});
      return { ok: true };
    });
  }
  /**
   * "Yes, confirm & pay". Demo-payment items (concept drops) are confirmed right here through the
   * same settle-and-allocate step a Stripe webhook uses. Stripe items get one order each and one
   * Checkout Session for all of them; they are confirmed only by the verified webhook (or the
   * demo simulator). Returns what the client should do next.
   */
  async confirmItems(
    userId: string,
    itemIds: string[],
    ageConfirmed: boolean,
    understood: boolean,
    createSession: typeof createCheckoutSession = createCheckoutSession,
  ): Promise<{
    basketId: string;
    confirmed: string[];
    url?: string;
    simulated?: boolean;
    orderIds: string[];
  }> {
    if (ageConfirmed !== true) throw new DomainError('AGE_CONFIRMATION_REQUIRED', 400);
    if (understood !== true) throw new DomainError('CONFIRMATION_REQUIRED', 400);
    const ids = [...new Set(itemIds)];
    if (!ids.length || ids.length > 10) throw new DomainError('INVALID_INPUT', 400);
    this.sweepExpired();
    const mode = paymentMode(this.demo);
    const basketId = randomUUID();
    const plan = this.transaction(() => {
      this.collector(userId);
      const items = ids.map((id) => this.ownItem(userId, id));
      for (const i of items) {
        if (i.state === 'expired') throw new DomainError('RESERVATION_EXPIRED');
        if (i.state !== 'opened') throw new DomainError('ITEM_NOT_OPEN');
        if (this.one(`SELECT 1 FROM order_items i WHERE i.id=? AND ${PENDING_FOR_ITEM}`, i.id))
          throw new DomainError('PAYMENT_IN_PROGRESS');
        const c = this.campaign(i.campaign_id);
        if (c.phase !== 'ACTIVE_PREORDER') throw new DomainError('PREORDER_CLOSED');
      }
      const card = items.filter((i) => i.payment_mode !== 'demo');
      if (card.length && mode === 'unavailable')
        throw new DomainError('PAYMENTS_NOT_CONFIGURED', 503);
      this.run('UPDATE users SET age_confirmed_at=? WHERE id=?', this.now(), userId);
      const orders = items.map((i) => {
        const c = this.campaign(i.campaign_id);
        const orderId = randomUUID();
        this.run(
          "INSERT INTO orders (id,user_id,campaign_id,access_id,amount,status,created_at) VALUES (?,?,?,NULL,?,'PENDING_PAYMENT',?)",
          orderId,
          userId,
          c.id,
          c.price,
          this.now(),
        );
        this.run(
          'INSERT INTO item_orders (order_id,item_id,basket_id,created_at) VALUES (?,?,?,?)',
          orderId,
          i.id,
          basketId,
          this.now(),
        );
        this.run(
          "INSERT INTO payments (id,kind,ref_id,user_id,amount_cents,status,expires_at,created_at,updated_at) VALUES (?,'B2C',?,?,?,'OPEN',?,?,?)",
          randomUUID(),
          orderId,
          userId,
          c.price,
          this.now() + SESSION_MINUTES * 60000,
          this.now(),
          this.now(),
        );
        this.audit(userId, 'order.created', 'order', orderId, { campaign: c.id, amount: c.price });
        return { item: i, orderId, price: c.price, name: c.name };
      });
      const confirmed: string[] = [];
      for (const o of orders.filter((x) => x.item.payment_mode === 'demo')) {
        // Concept drops never touch Stripe: a demo payment settles through the same handler.
        const r = this.applyPaymentEvent(
          {
            id: 'demo_' + o.orderId,
            type: 'checkout.session.completed',
            session: {
              id: 'demo_' + basketId,
              payment_status: 'paid',
              payment_intent: null,
              client_reference_id: o.orderId,
              metadata: { kind: 'B2C', order_id: o.orderId },
            },
          },
          true,
        );
        if (r.outcome !== 'paid') throw new DomainError('SOLD_OUT');
        confirmed.push(o.item.id);
      }
      this.audit(userId, 'checkout.confirmed', 'basket', basketId, {
        items: orders.length,
        demo: confirmed.length,
      });
      return { cardOrders: orders.filter((x) => x.item.payment_mode !== 'demo'), confirmed };
    });
    const orderIds = plan.cardOrders.map((o) => o.orderId);
    if (!plan.cardOrders.length) return { basketId, confirmed: plan.confirmed, orderIds };
    if (mode === 'simulated')
      return { basketId, confirmed: plan.confirmed, simulated: true, orderIds };
    const first = plan.cardOrders[0];
    try {
      const byCampaign = new Map<string, { name: string; unitAmountCents: number; quantity: number }>();
      for (const o of plan.cardOrders) {
        const line = byCampaign.get(o.item.campaign_id) ?? {
          name: o.name + ' figure (made to order)',
          unitAmountCents: o.price,
          quantity: 0,
        };
        line.quantity++;
        byCampaign.set(o.item.campaign_id, line);
      }
      const session = await createSession({
        kind: 'B2C',
        orderId: first.orderId,
        userId,
        refKey: 'campaign_id',
        refId: first.item.campaign_id,
        name: first.name,
        unitAmountCents: first.price,
        quantity: 1,
        lines: [...byCampaign.values()],
        metadata: orderIds.length > 1 ? { order_ids: orderIds.join(',') } : {},
        successPath: '/checkout/success?basket=' + basketId + '&',
        cancelPath: '/checkout?cancelled=1',
      });
      this.transaction(() => {
        this.run(
          "UPDATE payments SET stripe_session_id=?,updated_at=? WHERE kind='B2C' AND ref_id=?",
          session.id,
          this.now(),
          first.orderId,
        );
        for (const id of orderIds)
          this.run(
            "UPDATE payments SET expires_at=?,updated_at=? WHERE kind='B2C' AND ref_id=?",
            session.expiresAt,
            this.now(),
            id,
          );
      });
      return { basketId, confirmed: plan.confirmed, url: session.url, orderIds };
    } catch (e) {
      this.transaction(() => {
        for (const o of plan.cardOrders)
          this.run(
            "UPDATE orders SET status='EXPIRED' WHERE id=? AND status='PENDING_PAYMENT'",
            o.orderId,
          );
        for (const o of plan.cardOrders)
          this.run(
            "UPDATE payments SET status='EXPIRED',updated_at=? WHERE kind='B2C' AND ref_id=? AND status='OPEN'",
            this.now(),
            o.orderId,
          );
      });
      throw e instanceof DomainError ? e : new DomainError('PAYMENT_UNAVAILABLE', 502);
    }
  }
  snapshot(user: User | null, campaignId = 'astral'): Snapshot {
    const core = super.snapshot(user, campaignId);
    return {
      ...core,
      themes: this.themes(),
      interest: user ? this.interest(user.id) : [],
      items: user ? this.items(user.id) : [],
      slots: user
        ? this.all<{ id: string; campaign_id: string; expires_at: number }>(
            "SELECT id,campaign_id,expires_at FROM access WHERE user_id=? AND status='AVAILABLE' AND expires_at>? ORDER BY earned_at DESC",
            user.id,
            this.now(),
          )
        : [],
    };
  }
}
