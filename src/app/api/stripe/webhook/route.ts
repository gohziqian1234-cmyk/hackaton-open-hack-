import { openService } from '../../../../server/app';
import type Stripe from 'stripe';
import { failure, json } from '../../../../server/http';
import { DomainError } from '../../../../server/service';
import { verifyWebhook } from '../../../../server/stripe';
import { clientIp, takeToken } from '../../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const HANDLED = ['checkout.session.completed', 'checkout.session.expired'];
/** Stripe calls this. The signature is checked against the raw body before anything else. */
export async function POST(request: Request) {
  try {
    takeToken('webhook:' + clientIp(request), 300, 60000);
    const raw = await request.text();
    if (raw.length > 65536) throw new DomainError('REQUEST_TOO_LARGE', 413);
    const event = verifyWebhook(raw, request.headers.get('stripe-signature'));
    if (!HANDLED.includes(event.type)) return json({ received: true, outcome: 'ignored' });
    const session = event.data.object as Stripe.Checkout.Session;
    const result = await openService().handlePaymentEvent({
      id: event.id,
      type: event.type,
      session: {
        id: session.id,
        payment_status: session.payment_status,
        payment_intent:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent?.id ?? null),
        client_reference_id: session.client_reference_id,
        metadata: session.metadata,
      },
    });
    return json({ received: true, outcome: result.outcome });
  } catch (e) {
    return failure(e);
  }
}
