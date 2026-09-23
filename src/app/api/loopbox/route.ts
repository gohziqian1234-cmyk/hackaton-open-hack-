import { openService } from '../../../server/app';
import { cookies } from 'next/headers';
import { DomainError } from '../../../server/service';
import { actionSchema } from '../../../server/validation';
import { clientIp, clientKey, takeToken } from '../../../server/rate-limit';
import {
  SESSION_COOKIE,
  assertSameOrigin,
  failure,
  json as response,
  readText,
  sessionCookie,
} from '../../../server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    takeToken('get:' + clientKey(request, token), 120, 60000);
    const service = openService();
    const user = service.identity(token);
    const params = new URL(request.url).searchParams;
    const campaign = params.get('campaign') ?? 'astral';
    if (!/^[a-z0-9-]{1,64}$/.test(campaign)) throw new DomainError('INVALID_INPUT', 400);
    if (params.has('analytics')) {
      if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
      return response(service.analytics(user.id, campaign));
    }
    return response(service.snapshot(user, campaign));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const jarToken = (await cookies()).get(SESSION_COOKIE)?.value;
    takeToken('post:' + clientKey(request, jarToken), 20, 60000);
    const text = await readText(request, 8192);
    const parsed = actionSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new DomainError('INVALID_INPUT', 400);
    const data = parsed.data;
    const service = openService(),
      jar = await cookies();
    const old = jar.get(SESSION_COOKIE)?.value;
    const startSession = (token: string) => {
      // Rotate: the previous session (if any) is destroyed before the new one is issued.
      service.logout(old);
      jar.set(SESSION_COOKIE, token, sessionCookie(request));
    };
    if (data.action === 'login') {
      startSession(service.login(data.user));
      return response({ ok: true });
    }
    if (data.action === 'signup' || data.action === 'signin')
      takeToken('auth:' + clientIp(request), 10, 10 * 60000);
    if (data.action === 'signup') {
      const { token } = service.signup(data.name, data.email, data.password);
      startSession(token);
      return response({ ok: true });
    }
    if (data.action === 'signin') {
      const { token } = service.signin(data.email, data.password);
      startSession(token);
      return response({ ok: true });
    }
    if (data.action === 'signout') {
      service.logout(old);
      jar.delete(SESSION_COOKIE);
      return response({ ok: true });
    }
    const user = service.identity(old);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    switch (data.action) {
      case 'start':
        return response(service.startGame(user.id, data.mode, data.campaignId));
      case 'demoWin':
        return response(service.demoWin(user.id, data.campaignId));
      case 'complete':
        return response(service.completeGame(user.id, data.sessionId, data.values));
      case 'preorder':
        return response(service.preorder(user.id, data.accessId));
      case 'checkout':
        return response(await service.checkout(user.id, data.accessId, data.ageConfirmed));
      case 'cancelCheckout':
        return response(await service.cancelCheckout(user.id));
      case 'reveal':
        return response(service.reveal(user.id, data.allocationId));
      case 'trade':
        return response(service.listTrade(user.id, data.allocationId, data.wants));
      case 'keep':
        return response(service.cancelListing(user.id, data.allocationId));
      case 'respond':
        return response(service.respond(user.id, data.matchId, data.accept));
      case 'advance':
        return response(service.advance(user.id, data.campaignId));
      case 'publishCampaign':
        return response(service.publishCampaign(user.id, data.campaignId));
      case 'closeCampaign':
        return response(service.closeCampaign(user.id, data.campaignId));
      case 'sweep':
        return response(service.sweep(user.id));
      case 'applyPartner':
        return response(service.applyPartner(user.id, data.application));
      case 'decideApplication':
        return response(
          service.decideApplication(user.id, data.applicationId, data.decision, data.note),
        );
      case 'saveDraftCampaign':
        return response(service.saveDraftCampaign(user.id, data.campaign));
      case 'submitCampaign':
        return response(service.submitCampaign(user.id, data.campaignId));
      case 'edit':
        return response(service.edit(user.id, data.changes));
      case 'waitlist':
        return response(service.waitlist(user.id, data.campaignId));
      case 'notifyTheme':
        return response(service.notifyTheme(user.id, data.slug));
      case 'sendOtp':
        return response(service.sendOtp(user.id, data.channel, data.target));
      case 'verifyOtp':
        return response(service.verifyOtp(user.id, data.channel, data.code));
      case 'saveListing':
        return response(service.saveListing(user.id, data.listing));
      case 'publishListing':
        return response(service.publishListing(user.id, data.listingId));
      case 'pauseListing':
        return response(service.pauseListing(user.id, data.listingId));
      case 'buyListing':
        return response(
          await service.buyListing(user.id, data.listingId, data.quantity, data.ageConfirmed),
        );
      case 'fulfil':
        return response(service.fulfil(user.id, data.orderId, data.note));
      case 'confirmReceipt':
        return response(service.confirmReceipt(user.id, data.orderId));
      case 'report':
        return response(service.report(user.id, data.orderId, data.reason, data.details));
      case 'resolveReport':
        return response(await service.resolveReport(user.id, data.reportId, data.decision));
      case 'sendMessage':
        return response(service.sendMessage(user.id, data.threadId, data.body));
    }
  } catch (e) {
    return failure(e);
  }
}
