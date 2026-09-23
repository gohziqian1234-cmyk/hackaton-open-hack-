// Stripe (test mode only). Server-only: never import this from a client component.
import Stripe from 'stripe';
import { DomainError } from './errors';

export type CheckoutKind = 'B2C' | 'C2C';

/** Stripe Checkout requires expires_at 30 minutes to 24 hours after creation (SDK docs). */
export const SESSION_MINUTES = 31;

/** Hard ceiling on any single charge, so a bug or tampered price can never bill a large sum. */
export const maxChargeCents = () => {
  const configured = Number(process.env.MAX_CHARGE_CENTS);
  return Number.isInteger(configured) && configured > 0 ? configured : 100000;
};

export function paymentMode(demo: boolean): 'stripe' | 'simulated' | 'unavailable' {
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (demo && process.env.SIMULATE_PAYMENTS !== 'false') return 'simulated';
  return 'unavailable';
}
/** The demo-only simulated webhook is allowed without keys, or when SIMULATE_PAYMENTS=true. */
export const simulateAllowed = (demo: boolean) =>
  demo && (!process.env.STRIPE_SECRET_KEY || process.env.SIMULATE_PAYMENTS === 'true');

let client: Stripe | null = null;
function stripe() {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (!key) throw new DomainError('PAYMENTS_NOT_CONFIGURED', 503);
  // Test mode only. A live key is refused so the demo can never take real money.
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_'))
    throw new DomainError('LIVE_KEYS_REFUSED', 503);
  return (client ??= new Stripe(key));
}

function appUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';
  return url.replace(/\/+$/, '');
}

export async function createCheckoutSession(input: {
  kind: CheckoutKind;
  orderId: string;
  userId: string;
  refKey: 'campaign_id' | 'listing_id';
  refId: string;
  name: string;
  unitAmountCents: number;
  quantity: number;
  successPath: string;
  cancelPath: string;
}) {
  if (input.unitAmountCents * input.quantity > maxChargeCents())
    throw new DomainError('SPENDING_CAP', 422);
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: input.quantity,
        price_data: {
          currency: 'sgd',
          unit_amount: input.unitAmountCents,
          product_data: { name: input.name },
        },
      },
    ],
    client_reference_id: input.orderId,
    metadata: {
      kind: input.kind,
      order_id: input.orderId,
      user_id: input.userId,
      [input.refKey]: input.refId,
    },
    success_url: appUrl() + input.successPath + 'session_id={CHECKOUT_SESSION_ID}',
    cancel_url: appUrl() + input.cancelPath,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
  });
  if (!session.url) throw new DomainError('PAYMENT_UNAVAILABLE', 502);
  return { id: session.id, url: session.url, expiresAt: session.expires_at * 1000 };
}

export async function refundPaymentIntent(paymentIntent: string) {
  await stripe().refunds.create({ payment_intent: paymentIntent });
}

export async function expireCheckoutSession(sessionId: string) {
  await stripe().checkout.sessions.expire(sessionId);
}

/** Verifies the Stripe-Signature header against the raw body. Throws on any mismatch. */
export function verifyWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  if (!secret || !signature) throw new DomainError('INVALID_SIGNATURE', 400);
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new DomainError('INVALID_SIGNATURE', 400);
  }
}
