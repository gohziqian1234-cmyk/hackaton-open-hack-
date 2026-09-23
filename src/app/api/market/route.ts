import { openService } from '../../../server/app';
import { currentUser, failure, json } from '../../../server/http';
import { DomainError } from '../../../server/service';
import { marketQuerySchema } from '../../../server/validation';
import { clientIp, takeToken } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * GET /api/market?q=&theme=&min=&max=&rarity= → live listings (public)
 * GET /api/market?id=lst-…                   → one listing with its full stock table
 */
export async function GET(request: Request) {
  try {
    takeToken('market:' + clientIp(request), 120, 60000);
    const service = openService();
    const user = await currentUser(service);
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    if (id) {
      if (!/^lst-[a-z0-9-]{1,40}$/.test(id)) throw new DomainError('NOT_FOUND', 404);
      return json(service.listingDetail(id, user?.id));
    }
    const parsed = marketQuerySchema.safeParse(
      Object.fromEntries([...params].filter(([, v]) => v !== '')),
    );
    if (!parsed.success) throw new DomainError('INVALID_INPUT', 400);
    return json(service.marketListings(parsed.data));
  } catch (e) {
    return failure(e);
  }
}
