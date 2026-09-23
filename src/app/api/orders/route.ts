import { openService } from '../../../server/app';
import { currentUser, failure, json } from '../../../server/http';
import { DomainError } from '../../../server/service';
import { clientIp, takeToken } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * GET /api/orders        → your marketplace orders, buying and selling
 * GET /api/orders?id=mko → one order; only its buyer, its seller or an admin (404 otherwise)
 */
export async function GET(request: Request) {
  try {
    takeToken('orders:' + clientIp(request), 120, 60000);
    const service = openService();
    const user = await currentUser(service);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      if (!/^mko-[a-z0-9-]{1,40}$/.test(id)) throw new DomainError('NOT_FOUND', 404);
      return json(service.orderView(user.id, id));
    }
    return json(service.myMarketOrders(user.id));
  } catch (e) {
    return failure(e);
  }
}
