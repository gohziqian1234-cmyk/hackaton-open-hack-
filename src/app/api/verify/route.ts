import { openService } from '../../../server/app';
import { currentUser, failure, json } from '../../../server/http';
import { DomainError } from '../../../server/service';
import { clientIp, takeToken } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    takeToken('verify:' + clientIp(request), 60, 60000);
    const campaign = new URL(request.url).searchParams.get('campaign') ?? '';
    if (!/^[a-z0-9-]{1,64}$/.test(campaign)) throw new DomainError('INVALID_INPUT', 400);
    const service = openService();
    const user = await currentUser(service);
    return json(service.verification(campaign, user?.id));
  } catch (e) {
    return failure(e);
  }
}
