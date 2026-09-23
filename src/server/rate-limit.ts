// In-memory token buckets (single Node host, as the SQLite design already assumes).
// Each key gets `limit` requests per `windowMs`, refilled continuously.
import { createHash } from 'node:crypto';
import { DomainError } from './errors';

type Bucket = { tokens: number; updated: number };
const store = globalThis as unknown as { loopboxBuckets?: Map<string, Bucket> };
const buckets = (store.loopboxBuckets ??= new Map());
const MAX_KEYS = 20000;

/** Returns silently, or throws 429 RATE_LIMITED. */
export function takeToken(key: string, limit: number, windowMs: number, now = Date.now()) {
  const scaled = Math.max(1, Math.round(limit * limitScale()));
  const b = buckets.get(key) ?? { tokens: scaled, updated: now };
  b.tokens = Math.min(scaled, b.tokens + ((now - b.updated) / windowMs) * scaled);
  b.updated = now;
  buckets.delete(key);
  buckets.set(key, b); // re-insert keeps the Map ordered by last use
  if (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value!);
  if (b.tokens < 1) throw new DomainError('RATE_LIMITED', 429);
  b.tokens -= 1;
}

/** RATE_LIMIT_SCALE lets a load test raise every limit together (e.g. 50 in e2e). */
function limitScale() {
  const scale = Number(process.env.RATE_LIMIT_SCALE);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Client address as set by the host's reverse proxy (last hop), never a value we can't trust more. */
export function clientIp(request: Request) {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',').at(-1)!.trim();
  return 'local';
}

/** Signed-in requests are limited per session; anonymous ones per IP address. */
export function clientKey(request: Request, sessionToken?: string) {
  return sessionToken
    ? 's:' + createHash('sha256').update(sessionToken).digest('hex').slice(0, 24)
    : 'ip:' + clientIp(request);
}

export function resetRateLimits() {
  buckets.clear();
}
