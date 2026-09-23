import { openService } from '../../../server/app';
import { currentUser, failure, json } from '../../../server/http';
import { DomainError } from '../../../server/service';
import { clientIp, takeToken } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** GET /api/chat?thread=&after= → messages newer than `after`; only the buyer and seller (404 otherwise). */
export async function GET(request: Request) {
  try {
    // Polling every 5 s is 12 a minute; leave room for two open tabs.
    takeToken('chat:' + clientIp(request), 60, 60000);
    const service = openService();
    const user = await currentUser(service);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    const params = new URL(request.url).searchParams;
    const thread = params.get('thread') ?? '';
    const after = Number(params.get('after') ?? 0);
    if (!/^[a-z0-9-]{1,40}$/.test(thread)) throw new DomainError('NOT_FOUND', 404);
    if (!Number.isInteger(after) || after < 0) throw new DomainError('INVALID_INPUT', 400);
    return json({ userId: user.id, messages: service.messages(user.id, thread, after) });
  } catch (e) {
    return failure(e);
  }
}
