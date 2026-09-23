import { openService } from '../../../server/app';
import { currentUser, failure, json } from '../../../server/http';
import { DomainError } from '../../../server/service';
import { clientIp, takeToken } from '../../../server/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** ADMIN console data. Every read checks the ADMIN role in the service. */
export async function GET(request: Request) {
  try {
    takeToken('admin:' + clientIp(request), 60, 60000);
    const service = openService();
    const user = await currentUser(service);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    const entity = new URL(request.url).searchParams.get('entity') || undefined;
    if (entity && !/^[a-z_]{1,32}$/.test(entity)) throw new DomainError('INVALID_INPUT', 400);
    return json({
      campaigns: service.adminCampaigns(user.id),
      audit: service.auditLog(user.id, entity),
      applications: service.applications(user.id),
      reports: service.reports(user.id),
    });
  } catch (e) {
    return failure(e);
  }
}
