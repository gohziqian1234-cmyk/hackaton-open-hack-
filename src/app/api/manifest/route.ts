import { openService } from '../../../server/app';
import { currentUser, failure } from '../../../server/http';
import { DomainError } from '../../../server/service';
import { clientIp, takeToken } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Manufacturing manifest CSV. Partner members of the campaign or ADMIN only. */
export async function GET(request: Request) {
  try {
    takeToken('manifest:' + clientIp(request), 30, 60000);
    const campaign = new URL(request.url).searchParams.get('campaign') ?? '';
    if (!/^[a-z0-9-]{1,64}$/.test(campaign)) throw new DomainError('INVALID_INPUT', 400);
    const service = openService();
    const user = await currentUser(service);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    const m = service.manifest(user.id, campaign);
    return new Response(m.csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${m.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
