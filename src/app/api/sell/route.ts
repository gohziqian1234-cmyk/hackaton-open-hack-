import { openService } from '../../../server/app';
import { currentUser, failure, json } from '../../../server/http';
import { DomainError } from '../../../server/service';
import { clientIp, takeToken } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** GET /api/sell → your verification status, listings and money (held, owed, platform fees). */
export async function GET(request: Request) {
  try {
    takeToken('sell:' + clientIp(request), 60, 60000);
    const service = openService();
    const user = await currentUser(service);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    return json({
      role: user.role,
      verification: service.verificationStatus(user.id),
      ...service.sellerDashboard(user.id),
    });
  } catch (e) {
    return failure(e);
  }
}
