import { getDb } from '../../../../server/db';
import { assertSameOrigin, currentUser, failure, json } from '../../../../server/http';
import { DomainError, Loopbox } from '../../../../server/service';
import { simulateAllowed } from '../../../../server/stripe';
import { simulateSchema } from '../../../../server/validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** DEMO_MODE only: runs the real webhook handler with a synthetic "sim_" event. */
export async function POST(request: Request) {
  try {
    const service = new Loopbox(getDb());
    if (!simulateAllowed(service.demo)) throw new DomainError('NOT_FOUND', 404);
    assertSameOrigin(request);
    const text = await request.text();
    if (text.length > 1024) throw new DomainError('REQUEST_TOO_LARGE', 413);
    const parsed = simulateSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new DomainError('INVALID_INPUT', 400);
    const user = await currentUser(service);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    const result = service.simulatePayment(user.id, parsed.data.orderId, parsed.data.kind);
    return json({ ok: true, outcome: result.outcome });
  } catch (e) {
    return failure(e);
  }
}
