import { cookies } from 'next/headers';
import { getDb } from '../../../server/db';
import { Loopbox, DomainError } from '../../../server/service';
import { actionSchema } from '../../../server/validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  try {
    const service = new Loopbox(getDb());
    const user = service.identity((await cookies()).get('loopbox_session')?.value);
    if (new URL(request.url).searchParams.has('analytics')) {
      if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
      return response(service.analytics(user.id));
    }
    return response(service.snapshot(user));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (!origin || !host || new URL(origin).host !== host)
      throw new DomainError('INVALID_ORIGIN', 403);
    const text = await request.text();
    if (text.length > 8192) throw new DomainError('REQUEST_TOO_LARGE', 413);
    const parsed = actionSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new DomainError('INVALID_INPUT', 400);
    const data = parsed.data;
    const service = new Loopbox(getDb()),
      jar = await cookies();
    if (data.action === 'login') {
      const old = jar.get('loopbox_session')?.value;
      if (old) service.run('DELETE FROM sessions WHERE token=?', old);
      const token = service.login(data.user);
      jar.set('loopbox_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: new URL(request.url).protocol === 'https:',
        path: '/',
        maxAge: 86400,
      });
      return response({ ok: true });
    }
    const user = service.identity(jar.get('loopbox_session')?.value);
    if (!user) throw new DomainError('SIGN_IN_REQUIRED', 401);
    switch (data.action) {
      case 'start':
        return response(service.startGame(user.id, data.mode));
      case 'complete':
        return response(service.completeGame(user.id, data.sessionId, data.values));
      case 'preorder':
        return response(service.preorder(user.id, data.accessId));
      case 'reveal':
        return response(service.reveal(user.id, data.allocationId));
      case 'trade':
        return response(service.listTrade(user.id, data.allocationId, data.wants));
      case 'keep':
        return response(service.cancelListing(user.id, data.allocationId));
      case 'respond':
        return response(service.respond(user.id, data.matchId, data.accept));
      case 'advance':
        return response(service.advance(user.id));
      case 'edit':
        return response(service.edit(user.id, data.changes));
      case 'waitlist':
        service.collector(user.id);
        service.run('INSERT OR IGNORE INTO waitlist VALUES (?,?)', user.id, 'astral');
        return response({ ok: true });
    }
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  if (e instanceof DomainError) return response({ error: e.code }, e.status);
  if (e instanceof SyntaxError) return response({ error: 'INVALID_INPUT' }, 400);
  console.error('LoopBox request failed', e instanceof Error ? e.message : 'unknown');
  return response({ error: 'SERVER_ERROR' }, 500);
}
