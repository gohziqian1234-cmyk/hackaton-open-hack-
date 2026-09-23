import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { createDatabase } from '../src/server/db';
import { DomainError, Loopbox, type PaymentEvent } from '../src/server/service';
import { actionSchema } from '../src/server/validation';
import { createCheckoutSession, verifyWebhook } from '../src/server/stripe';

const ENV = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SIMULATE_PAYMENTS', 'MAX_CHARGE_CENTS'];
let saved: Record<string, string | undefined>;
const open: Loopbox[] = [];
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
function make(demo = true, now = () => Date.now()) {
  const s = new Loopbox(createDatabase(':memory:'), now, demo);
  open.push(s);
  return s;
}
function slot(s: Loopbox, user = 'collector') {
  const g = s.startGame(user, 'lore');
  return s.completeGame(user, g.id, [1, 0, 2]).accessId!;
}
const fakeSession: typeof createCheckoutSession = async (input) => ({
  id: 'cs_test_' + input.orderId,
  url: 'https://checkout.stripe.test/' + input.orderId,
  expiresAt: Date.now() + 31 * 60000,
});
function completed(orderId: string, eventId = 'evt_' + orderId, intent = 'pi_' + orderId): PaymentEvent {
  return {
    id: eventId,
    type: 'checkout.session.completed',
    session: {
      id: 'cs_test_' + orderId,
      payment_status: 'paid',
      payment_intent: intent,
      client_reference_id: orderId,
      metadata: { kind: 'B2C', order_id: orderId },
    },
  };
}
const code = async (fn: () => unknown) => {
  try {
    await fn();
    return 'no error';
  } catch (e) {
    return e instanceof DomainError ? `${e.code}:${e.status}` : String(e);
  }
};

describe('checkout (Stripe test mode)', () => {
  it('requires ageConfirmed: true at the API boundary and in the service', async () => {
    expect(actionSchema.safeParse({ action: 'checkout', accessId: 'a' }).success).toBe(false);
    expect(
      actionSchema.safeParse({ action: 'checkout', accessId: 'a', ageConfirmed: false }).success,
    ).toBe(false);
    const s = make();
    expect(await code(() => s.checkout('collector', slot(s), false))).toBe(
      'AGE_CONFIRMATION_REQUIRED:400',
    );
  });
  it('reserves a seat, prices from the database, and allocates only after the webhook', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    const s = make();
    let charged = 0;
    const result = await s.checkout('collector', slot(s), true, async (input) => {
      charged = input.unitAmountCents * input.quantity;
      return fakeSession(input);
    });
    expect('url' in result && result.url).toContain('checkout.stripe.test');
    expect(charged).toBe(1890);
    const orderId = result.orderId;
    expect(s.one('SELECT status FROM orders WHERE id=?', orderId)).toEqual({
      status: 'PENDING_PAYMENT',
    });
    expect(s.campaign().confirmed).toBe(94); // the seat is held
    expect(s.all('SELECT * FROM allocations WHERE order_id=?', orderId)).toHaveLength(0);
    const r = s.processPaymentEvent(completed(orderId));
    expect(r.outcome).toBe('paid');
    expect(s.one('SELECT status FROM orders WHERE id=?', orderId)).toEqual({ status: 'PAID' });
    expect(s.all('SELECT * FROM allocations WHERE order_id=?', orderId)).toHaveLength(1);
    expect(
      s.one<{ status: string; payment_intent: string }>(
        'SELECT status,payment_intent FROM payments WHERE ref_id=?',
        orderId,
      ),
    ).toEqual({ status: 'PAID', payment_intent: 'pi_' + orderId });
  });
  it('processes the same Stripe event three times but allocates once', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    const s = make();
    const { orderId } = await s.checkout('collector', slot(s), true, fakeSession);
    const event = completed(orderId);
    const outcomes = [1, 2, 3].map(() => s.processPaymentEvent(event).outcome);
    expect(outcomes).toEqual(['paid', 'duplicate', 'duplicate']);
    expect(s.all('SELECT * FROM allocations WHERE order_id=?', orderId)).toHaveLength(1);
    expect(s.all('SELECT * FROM webhook_events')).toHaveLength(1);
  });
  it('a failed Stripe call frees the seat and gives the slot back', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    const s = make();
    const access = slot(s);
    expect(
      await code(() =>
        s.checkout('collector', access, true, async () => {
          throw new Error('network down');
        }),
      ),
    ).toBe('PAYMENT_UNAVAILABLE:502');
    expect(s.campaign().confirmed).toBe(93);
    expect(s.one('SELECT status FROM access WHERE id=?', access)).toEqual({ status: 'AVAILABLE' });
  });
  it('checkout.session.expired releases the seat and expires the slot', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    const s = make();
    const access = slot(s);
    const { orderId } = await s.checkout('collector', access, true, fakeSession);
    const r = s.processPaymentEvent({ ...completed(orderId, 'evt_exp'), type: 'checkout.session.expired' });
    expect(r.outcome).toBe('expired');
    expect(s.campaign().confirmed).toBe(93);
    expect(s.one('SELECT status FROM access WHERE id=?', access)).toEqual({ status: 'EXPIRED' });
  });
  it('a late payment after expiry takes a free box, or is refunded when none is left', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    const s = make();
    s.run('UPDATE campaigns SET max_per_user=5');
    const a = await s.checkout('collector', slot(s), true, fakeSession);
    s.processPaymentEvent({ ...completed(a.orderId, 'evt_a_exp'), type: 'checkout.session.expired' });
    expect(s.processPaymentEvent(completed(a.orderId, 'evt_a_paid')).outcome).toBe('paid');
    const b = await s.checkout('collector', slot(s), true, fakeSession);
    s.processPaymentEvent({ ...completed(b.orderId, 'evt_b_exp'), type: 'checkout.session.expired' });
    s.run('UPDATE campaigns SET capacity=94');
    const refunds: string[] = [];
    const r = await s.handlePaymentEvent(completed(b.orderId, 'evt_b_paid'), async (pi) => {
      refunds.push(pi);
    });
    expect(r.outcome).toBe('refund');
    expect(refunds).toEqual(['pi_' + b.orderId]);
    expect(s.one('SELECT status FROM orders WHERE id=?', b.orderId)).toEqual({ status: 'REFUNDED' });
  });
  it('50 completions for the last 3 seats: exactly 3 boxes, 47 refunds', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    const now = Date.now();
    const s = make(true, () => now);
    s.run('UPDATE campaigns SET capacity=96');
    // 50 checkouts whose sessions already expired (seat released), then all 50 pay late.
    const ids = Array.from({ length: 50 }, (_, i) => {
      const id = 'late-' + i;
      s.run(
        "INSERT INTO orders (id,user_id,campaign_id,amount,status,created_at) VALUES (?,?,'astral',1890,'EXPIRED',?)",
        id,
        'demo-' + (i % 16),
        now,
      );
      s.run(
        "INSERT INTO payments (id,kind,ref_id,user_id,stripe_session_id,amount_cents,status,expires_at,created_at,updated_at) VALUES (?,'B2C',?,?,?,1890,'EXPIRED',?,?,?)",
        'pay-' + id,
        id,
        'demo-' + (i % 16),
        'cs_test_' + id,
        now,
        now,
        now,
      );
      return id;
    });
    const refunds: string[] = [];
    const results = await Promise.all(
      ids.map((id) =>
        s.handlePaymentEvent(completed(id), async (pi) => {
          refunds.push(pi);
        }),
      ),
    );
    expect(results.filter((r) => r.outcome === 'paid')).toHaveLength(3);
    expect(results.filter((r) => r.outcome === 'refund')).toHaveLength(47);
    expect(refunds).toHaveLength(47);
    const allocated = s.all<{ pool_unit_id: string }>(
      "SELECT pool_unit_id FROM allocations WHERE order_id LIKE 'late-%'",
    );
    expect(allocated).toHaveLength(3);
    expect(new Set(allocated.map((a) => a.pool_unit_id)).size).toBe(3);
    expect(s.one("SELECT COUNT(*) AS n FROM orders WHERE status='REFUNDED'")).toEqual({ n: 47 });
    expect(s.campaign().confirmed).toBe(96);
  });
});

describe('webhook signature', () => {
  const payload = JSON.stringify({ id: 'evt_sig', object: 'event', type: 'checkout.session.completed' });
  it('accepts a correctly signed raw body', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit';
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_unit' });
    expect(verifyWebhook(payload, header).id).toBe('evt_sig');
  });
  it('rejects a bad signature, a changed body, or a missing header with 400', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit';
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' });
    expect(await code(() => verifyWebhook(payload, header))).toBe('INVALID_SIGNATURE:400');
    const good = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_unit' });
    expect(await code(() => verifyWebhook(payload.replace('evt_sig', 'evt_x'), good))).toBe(
      'INVALID_SIGNATURE:400',
    );
    expect(await code(() => verifyWebhook(payload, null))).toBe('INVALID_SIGNATURE:400');
  });
  it('the webhook route answers 400 to an unsigned request', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit';
    const { POST } = await import('../src/app/api/stripe/webhook/route');
    const res = await POST(
      new Request('http://127.0.0.1/api/stripe/webhook', {
        method: 'POST',
        body: payload,
        headers: { 'stripe-signature': 't=1,v1=forged' },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_SIGNATURE' });
  });
});

describe('simulated payments and safety rails', () => {
  it('simulate is 404 outside demo mode', async () => {
    const s = make(false);
    expect(await code(() => s.simulatePayment('collector', 'any-order'))).toBe('NOT_FOUND:404');
    const demo = make(true);
    expect(await code(() => demo.preorder('collector', 'x'))).not.toBe('NOT_FOUND:404');
    const live = make(false);
    expect(await code(() => live.preorder('collector', 'x'))).toBe('NOT_FOUND:404');
  });
  it('simulate pays only your own open order, once, through the webhook handler', async () => {
    const s = make(true);
    const r = await s.checkout('collector', slot(s), true);
    expect(r).toMatchObject({ simulated: true });
    expect(await code(() => s.simulatePayment('demo-0', r.orderId))).toBe('NOT_FOUND:404');
    expect(s.simulatePayment('collector', r.orderId).outcome).toBe('paid');
    expect(s.one('SELECT status FROM payments WHERE ref_id=?', r.orderId)).toEqual({
      status: 'SIMULATED',
    });
    expect(await code(() => s.simulatePayment('collector', r.orderId))).toBe('ALREADY_DONE:409');
  });
  it('without keys outside demo mode, checkout says payments are not configured', async () => {
    const s = make(false);
    expect(await code(() => s.checkout('collector', slot(s), true))).toBe(
      'PAYMENTS_NOT_CONFIGURED:503',
    );
  });
  it('refuses live Stripe keys and charges above the spending cap', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_nope';
    const input = {
      kind: 'B2C' as const,
      orderId: 'o',
      userId: 'u',
      refKey: 'campaign_id' as const,
      refId: 'astral',
      name: 'Box',
      unitAmountCents: 1890,
      quantity: 1,
      successPath: '/checkout/success?',
      cancelPath: '/checkout?cancelled=1',
    };
    expect(await code(() => createCheckoutSession(input))).toBe('LIVE_KEYS_REFUSED:503');
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit';
    process.env.MAX_CHARGE_CENTS = '1000';
    expect(await code(() => createCheckoutSession(input))).toBe('SPENDING_CAP:422');
  });
  it('writes an append-only audit trail with no personal data', async () => {
    const s = make(true);
    const r = await s.checkout('collector', slot(s), true);
    s.simulatePayment('collector', r.orderId);
    const actions = s
      .all<{ action: string; detail: string }>('SELECT action,detail FROM audit_log ORDER BY rowid')
      .map((a) => a.action);
    expect(actions).toEqual(['order.created', 'order.paid', 'allocation.created']);
    expect(await code(() => s.run("UPDATE audit_log SET action='x'"))).toContain('IMMUTABLE');
    expect(await code(() => s.run('DELETE FROM audit_log'))).toContain('IMMUTABLE');
  });
  it('lazy expiry: an unpaid order past its session expiry frees its seat on the next read', async () => {
    let now = Date.now();
    const s = make(true, () => now);
    const r = await s.checkout('collector', slot(s), true);
    expect(s.campaign().confirmed).toBe(94);
    now += 32 * 60000;
    s.snapshot(s.user('collector'));
    expect(s.one('SELECT status FROM orders WHERE id=?', r.orderId)).toEqual({ status: 'EXPIRED' });
    expect(s.campaign().confirmed).toBe(93);
  });
});
