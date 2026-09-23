import { openService } from '../../../server/app';
import { currentUser, failure, json } from '../../../server/http';
import { DomainError } from '../../../server/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * GET /api/partner             → your application status, and your dashboard if you are a partner
 * GET /api/partner?campaign=id → one of your campaigns for the editor (404 if not yours)
 */
export async function GET(request: Request) {
  try {
    const service = openService();
    const user = await currentUser(service);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    const campaign = new URL(request.url).searchParams.get('campaign');
    if (campaign) {
      if (!/^[a-z0-9-]{1,64}$/.test(campaign)) throw new DomainError('INVALID_INPUT', 400);
      return json(service.campaignDraft(user.id, campaign));
    }
    const partner = user.role === 'BUSINESS' ? service.myPartner(user.id) : null;
    return json({
      user: { id: user.id, role: user.role },
      application: service.myApplication(user.id),
      dashboard: partner ? service.partnerDashboard(user.id) : null,
    });
  } catch (e) {
    return failure(e);
  }
}
