import { cookies } from 'next/headers';
import { getDb } from './db';
import { DomainError, Loopbox } from './service';

export const SESSION_COOKIE = 'loopbox_session';

/**
 * HttpOnly, SameSite=Strict, 24 h. Secure whenever the request arrived over HTTPS (directly or
 * through the host's TLS proxy), or always when COOKIE_SECURE=true. Plain-HTTP localhost demos
 * keep working because browsers would drop a Secure cookie there.
 */
export function sessionCookie(request: Request) {
  const https =
    process.env.COOKIE_SECURE === 'true' ||
    new URL(request.url).protocol === 'https:' ||
    request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: https,
    path: '/',
    maxAge: 86400,
    priority: 'high' as const,
  };
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/** Maps any thrown error to the `{ error: CODE }` contract without leaking internals. */
export function failure(e: unknown) {
  if (e instanceof DomainError) return json({ error: e.code }, e.status);
  if (e instanceof SyntaxError) return json({ error: 'INVALID_INPUT' }, 400);
  console.error('LoopBox request failed', e instanceof Error ? e.message : 'unknown');
  return json({ error: 'SERVER_ERROR' }, 500);
}

/** Rejects cross-site POSTs: the Origin header must match the Host. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) throw new DomainError('INVALID_ORIGIN', 403);
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new DomainError('INVALID_ORIGIN', 403);
  }
  if (originHost !== host) throw new DomainError('INVALID_ORIGIN', 403);
}

export async function currentUser(service = new Loopbox(getDb())) {
  return service.identity((await cookies()).get(SESSION_COOKIE)?.value);
}
