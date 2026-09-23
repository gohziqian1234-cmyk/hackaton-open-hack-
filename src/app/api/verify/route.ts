import { getDb } from '../../../server/db';
import { currentUser, failure, json } from '../../../server/http';
import { DomainError, Loopbox } from '../../../server/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const campaign = new URL(request.url).searchParams.get('campaign') ?? '';
    if (!/^[a-z0-9-]{1,64}$/.test(campaign)) throw new DomainError('INVALID_INPUT', 400);
    const service = new Loopbox(getDb());
    const user = await currentUser(service);
    return json(service.verification(campaign, user?.id));
  } catch (e) {
    return failure(e);
  }
}
