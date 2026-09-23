// v2 open-before-pay: slot → opened → confirmed, with decline and expiry (brief §7.3).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/server/db';
import { App } from '../src/server/app';
import { DomainError } from '../src/server/service';
import type { createCheckoutSession } from '../src/server/stripe';

const ENV = ['STRIPE_SECRET_KEY', 'SIMULATE_PAYMENTS', 'DEMO_MODE'];
let saved: Record<string, string | undefined>;
const open: App[] = [];
beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  while (open.length) open.pop()!.db.close();
});
function make() {
  const clock = { t: Date.now() };
  const s = new App(createDatabase(':memory:'), () => clock.t, true);
  open.push(s);
  return { s, clock };
}
const win = (s: App, campaign: string, user = 'collector') => s.demoWin(user, campaign).accessId;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof DomainError ? e.code : String(e);
  }
  return 'OK';
};
const held = (s: App, campaign: string) =>
  s.one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM order_items WHERE campaign_id=? AND state='opened'",
    campaign,
  )!.n;
const fakeSession: typeof createCheckoutSession = async (input) => ({
  id: 'cs_test_' + input.orderId,
  url: 'https://checkout.stripe.test/' + input.orderId,
  expiresAt: Date.now() + 31 * 60000,
});

describe('opening a slot', () => {
  it('draws the next position of the committed shuffle before any payment and consumes the slot', () => {
    const { s, clock } = make();
    const accessId = win(s, 'astral');
    const item = s.openSlot('collector', accessId);
    // Demo seed: position 93 (the 94th box) is Eclipse Knight.
    expect(item).toMatchObject({ state: 'opened', character_id: 'eclipse', position: 93 });
    expect(item.reserved_until).toBe(clock.t + 30 * 60000);
    expect(s.campaign('astral').confirmed).toBe(94);
    expect(code(() => s.openSlot('collector', accessId))).toBe('ACCESS_ALREADY_USED');
    expect(s.one('SELECT status FROM access WHERE id=?', accessId)).toEqual({ status: 'REDEEMED' });
  });

  it('refuses another collector’s slot and another collector’s items', () => {
    const { s } = make();
    const accessId = win(s, 'naruto');
    expect(code(() => s.openSlot('demo-0', accessId))).toBe('INVALID_ACCESS');
    const item = s.openSlot('collector', accessId);
    expect(code(() => s.declineItem('demo-0', item.id))).toBe('NOT_FOUND');
    return expect(s.confirmItems('demo-0', [item.id], true, true)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('anti-abuse (brief §7.3)', () => {
  it('declining returns the figure to the pool and can never trigger a new draw for that slot', () => {
    const { s } = make();
    const accessId = win(s, 'naruto');
    const first = s.openSlot('collector', accessId);
    expect(held(s, 'naruto')).toBe(1);
    s.declineItem('collector', first.id);
    expect(held(s, 'naruto')).toBe(0);
    expect(s.item('collector', first.id).state).toBe('declined');
    // Same slot again: no re-roll.
    expect(code(() => s.openSlot('collector', accessId))).toBe('ACCESS_ALREADY_USED');
    expect(code(() => s.declineItem('collector', first.id))).toBe('ITEM_NOT_OPEN');
    // The returned figure is back in stock: the next opener (anyone) gets that exact position.
    const next = s.openSlot('demo-0', win(s, 'naruto', 'demo-0'));
    expect(next.position).toBe(first.position);
    expect(next.character_id).toBe(first.character_id);
  });

  it('expired items return their stock exactly once', () => {
    const { s, clock } = make();
    const item = s.openSlot('collector', win(s, 'edgerunners'));
    expect(s.campaign('edgerunners').confirmed).toBe(1);
    clock.t += 31 * 60000;
    s.sweepExpired();
    s.sweepExpired();
    expect(s.item('collector', item.id).state).toBe('expired');
    expect(s.campaign('edgerunners').confirmed).toBe(0);
    expect(
      s.all("SELECT * FROM audit_log WHERE action='item.expired' AND entity_id=?", item.id),
    ).toHaveLength(1);
    // Expired stays expired: it cannot be paid for or declined.
    expect(code(() => s.declineItem('collector', item.id))).toBe('ITEM_NOT_OPEN');
    return expect(s.confirmItems('collector', [item.id], true, true)).rejects.toMatchObject({
      code: 'RESERVATION_EXPIRED',
    });
  });

  it('per-person max counts slots won: a 3rd slot is blocked even after two declines', () => {
    const { s } = make();
    for (let n = 0; n < 2; n++) {
      const item = s.openSlot('collector', win(s, 'naruto'));
      s.declineItem('collector', item.id);
    }
    expect(s.purchases('collector', 'naruto')).toBe(2);
    expect(code(() => s.demoWin('collector', 'naruto'))).toBe('PURCHASE_LIMIT');
    expect(code(() => s.startGame('collector', 'lore', 'naruto'))).toBe('PURCHASE_LIMIT');
  });

  it('an unused slot that expires does not count, and cannot be opened late', () => {
    const { s, clock } = make();
    const accessId = win(s, 'naruto');
    clock.t += 16 * 60000;
    expect(code(() => s.openSlot('collector', accessId))).toBe('ACCESS_EXPIRED');
    s.sweepExpired();
    expect(s.purchases('collector', 'naruto')).toBe(0);
  });
});

describe('confirm & pay', () => {
  it('demo items (concept drops) are confirmed in place, never via Stripe, with the drawn unit', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const { s } = make();
    const item = s.openSlot('collector', win(s, 'naruto'));
    let stripeCalls = 0;
    const r = await s.confirmItems('collector', [item.id], true, true, async (i) => {
      stripeCalls++;
      return fakeSession(i);
    });
    expect(stripeCalls).toBe(0);
    expect(r.confirmed).toEqual([item.id]);
    expect(r.url).toBeUndefined();
    const after = s.item('collector', item.id);
    expect(after).toMatchObject({ state: 'confirmed', payment_mode: 'demo' });
    const allocation = s.one<{ character_id: string; revealed: number; pool_unit_id: string }>(
      'SELECT character_id,revealed,pool_unit_id FROM allocations WHERE id=?',
      after.allocation_id!,
    )!;
    expect(allocation.character_id).toBe(item.character_id);
    expect(allocation.revealed).toBe(1);
    expect(s.one('SELECT status FROM payments WHERE ref_id=?', after.order_id!)).toEqual({
      status: 'SIMULATED',
    });
    expect(s.campaign('naruto').confirmed).toBe(1);
    expect(s.purchases('collector', 'naruto')).toBe(1);
  });

  it('Stripe items (Astral Kin) wait for the payment, then get exactly the unit that was shown', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const { s } = make();
    const item = s.openSlot('collector', win(s, 'astral'));
    const r = await s.confirmItems('collector', [item.id], true, true, fakeSession);
    expect(r.url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(s.item('collector', item.id)).toMatchObject({ state: 'opened', pending: true });
    // A pending card payment keeps the hold alive past the reservation, and blocks decline.
    expect(code(() => s.declineItem('collector', item.id))).toBe('PAYMENT_IN_PROGRESS');
    const orderId = r.orderIds[0];
    const paid = s.processPaymentEvent({
      id: 'evt_1',
      type: 'checkout.session.completed',
      session: {
        id: 'cs_test_' + orderId,
        payment_status: 'paid',
        payment_intent: 'pi_1',
        client_reference_id: orderId,
        metadata: { kind: 'B2C', order_id: orderId },
      },
    });
    expect(paid.outcome).toBe('paid');
    const after = s.item('collector', item.id);
    expect(after.state).toBe('confirmed');
    expect(
      s.one<{ character_id: string }>(
        'SELECT character_id FROM allocations WHERE id=?',
        after.allocation_id!,
      )!.character_id,
    ).toBe('eclipse');
    expect(s.campaign('astral').confirmed).toBe(94);
  });

  it('a mixed basket confirms demo items first and pays several card items in one session', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const { s } = make();
    s.run("UPDATE campaigns SET max_per_user=5 WHERE id='astral'");
    const a1 = s.openSlot('collector', win(s, 'astral'));
    const a2 = s.openSlot('collector', win(s, 'astral'));
    const n1 = s.openSlot('collector', win(s, 'naruto'));
    let lines: unknown;
    const r = await s.confirmItems('collector', [a1.id, n1.id, a2.id], true, true, async (i) => {
      lines = i.lines;
      return fakeSession(i);
    });
    expect(r.confirmed).toEqual([n1.id]);
    expect(r.orderIds).toHaveLength(2);
    expect(lines).toEqual([
      { name: 'Astral Kin figure (made to order)', unitAmountCents: 1890, quantity: 2 },
    ]);
    const paid = s.processPaymentEvent({
      id: 'evt_basket',
      type: 'checkout.session.completed',
      session: {
        id: 'cs_basket',
        payment_status: 'paid',
        payment_intent: 'pi_basket',
        client_reference_id: r.orderIds[0],
        metadata: { kind: 'B2C', order_id: r.orderIds[0], order_ids: r.orderIds.join(',') },
      },
    });
    expect(paid.outcome).toBe('paid');
    expect([a1, a2, n1].map((i) => s.item('collector', i.id).state)).toEqual([
      'confirmed',
      'confirmed',
      'confirmed',
    ]);
  });

  it('simulated card payments (no Stripe key) settle the whole basket through the same handler', async () => {
    const { s } = make();
    s.run("UPDATE campaigns SET max_per_user=5 WHERE id='astral'");
    const a1 = s.openSlot('collector', win(s, 'astral'));
    const a2 = s.openSlot('collector', win(s, 'astral'));
    const r = await s.confirmItems('collector', [a1.id, a2.id], true, true, fakeSession);
    expect(r.simulated).toBe(true);
    expect(s.simulatePayment('collector', r.orderIds[0]).outcome).toBe('paid');
    expect(s.item('collector', a2.id).state).toBe('confirmed');
    expect(s.campaign('astral').confirmed).toBe(95);
  });

  it('a card payment that arrives after the reservation lapsed and the figure went to someone else is refunded', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const { s, clock } = make();
    const item = s.openSlot('collector', win(s, 'naruto'));
    s.run("UPDATE order_items SET payment_mode='stripe' WHERE id=?", item.id);
    const r = await s.confirmItems('collector', [item.id], true, true, fakeSession);
    // Stripe expires the session, the reservation lapses, someone else draws the same unit.
    s.processPaymentEvent({
      id: 'evt_exp',
      type: 'checkout.session.expired',
      session: {
        id: 'cs',
        client_reference_id: r.orderIds[0],
        metadata: { kind: 'B2C', order_id: r.orderIds[0] },
      },
    });
    clock.t += 31 * 60000;
    s.sweepExpired();
    expect(s.item('collector', item.id).state).toBe('expired');
    expect(s.openSlot('demo-0', win(s, 'naruto', 'demo-0')).position).toBe(item.position);
    const late = s.processPaymentEvent({
      id: 'evt_late',
      type: 'checkout.session.completed',
      session: {
        id: 'cs',
        payment_status: 'paid',
        payment_intent: 'pi_late',
        client_reference_id: r.orderIds[0],
        metadata: { kind: 'B2C', order_id: r.orderIds[0] },
      },
    });
    expect(late.outcome).toBe('refund');
    expect(s.item('collector', item.id).state).toBe('expired');
  });

  it('requires both the age and the made-for-me confirmations', async () => {
    const { s } = make();
    const item = s.openSlot('collector', win(s, 'naruto'));
    await expect(s.confirmItems('collector', [item.id], false, true)).rejects.toMatchObject({
      code: 'AGE_CONFIRMATION_REQUIRED',
    });
    await expect(s.confirmItems('collector', [item.id], true, false)).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
    });
  });

  it('confirmed items follow the campaign into production and shipping', async () => {
    const { s } = make();
    const item = s.openSlot('collector', win(s, 'naruto'));
    await s.confirmItems('collector', [item.id], true, true);
    for (let i = 0; i < 4; i++) s.advance('admin', 'naruto');
    expect(s.item('collector', item.id).state).toBe('in_production');
    s.advance('admin', 'naruto');
    expect(s.item('collector', item.id).state).toBe('shipped');
  });
});
