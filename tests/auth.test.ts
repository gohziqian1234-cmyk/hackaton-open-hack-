import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/server/db';
import { DomainError } from '../src/server/service';
import { App } from '../src/server/app';
import { hashPassword, hashToken, verifyPassword } from '../src/server/password';
import { actionSchema, applicationSchema } from '../src/server/validation';
import { resetRateLimits, takeToken } from '../src/server/rate-limit';
import { safeNext } from '../src/lib/safe-next';

const open: App[] = [];
afterEach(() => {
  while (open.length) open.pop()!.db.close();
  resetRateLimits();
});
function make(now = () => Date.now()) {
  const s = new App(createDatabase(':memory:'), now, true);
  open.push(s);
  return s;
}
function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return `${e.code}:${e.status}`;
    throw e;
  }
  return 'no error';
}

describe('passwords and sessions', () => {
  it('hashes with scrypt and verifies in constant time', () => {
    const hash = hashPassword('correct horse battery');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(hash).not.toContain('correct');
    expect(verifyPassword('correct horse battery', hash)).toBe(true);
    expect(verifyPassword('wrong horse battery', hash)).toBe(false);
    expect(verifyPassword('anything', null)).toBe(false);
    expect(verifyPassword('anything', 'scrypt$garbage')).toBe(false);
  });
  it('sign-up creates a collector; the password and session token are never stored in clear', () => {
    const s = make();
    const { userId, token } = s.signup('Nadia', 'nadia@example.com', 'a long passphrase');
    const row = s.one<{ role: string; password_hash: string }>(
      'SELECT role,password_hash FROM users WHERE id=?',
      userId,
    )!;
    expect(row.role).toBe('COLLECTOR');
    expect(row.password_hash).not.toContain('passphrase');
    expect(s.one('SELECT 1 AS x FROM sessions WHERE token=?', token)).toBeUndefined();
    expect(s.one('SELECT 1 AS x FROM sessions WHERE token=?', hashToken(token))).toEqual({ x: 1 });
    expect(s.identity(token)?.id).toBe(userId);
    s.logout(token);
    expect(s.identity(token)).toBeNull();
    expect(codeOf(() => s.signup('Other', 'nadia@example.com', 'another passphrase'))).toBe(
      'EMAIL_TAKEN:409',
    );
  });
  it('gives the same error for an unknown email and a wrong password', () => {
    const s = make();
    s.signup('Nadia', 'nadia@example.com', 'a long passphrase');
    expect(codeOf(() => s.signin('nadia@example.com', 'nope'))).toBe('INVALID_CREDENTIALS:401');
    expect(codeOf(() => s.signin('nobody@example.com', 'nope'))).toBe('INVALID_CREDENTIALS:401');
    expect(s.identity(s.signin('nadia@example.com', 'a long passphrase').token)?.name).toBe(
      'Nadia',
    );
  });
  it('locks an account for 15 minutes after 5 wrong passwords, even for the right one', () => {
    let now = Date.now();
    const s = make(() => now);
    s.signup('Nadia', 'nadia@example.com', 'a long passphrase');
    for (let i = 0; i < 5; i++) codeOf(() => s.signin('nadia@example.com', 'wrong'));
    expect(codeOf(() => s.signin('nadia@example.com', 'a long passphrase'))).toBe(
      'ACCOUNT_LOCKED:429',
    );
    now += 15 * 60000 + 1;
    expect(s.signin('nadia@example.com', 'a long passphrase').token).toBeTruthy();
  });
  it('validates and cleans sign-up input at the boundary', () => {
    const ok = actionSchema.safeParse({
      action: 'signup',
      name: '  Nadia‮\u0000  Tan ',
      email: ' NADIA@Example.com ',
      password: 'a long passphrase',
    });
    expect(ok.success && ok.data).toMatchObject({ name: 'Nadia Tan', email: 'nadia@example.com' });
    expect(
      actionSchema.safeParse({
        action: 'signup',
        name: 'N',
        email: 'x',
        password: 'long enough pw',
      }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({ action: 'signup', name: 'N', email: 'n@x.co', password: 'short' })
        .success,
    ).toBe(false);
  });
});

describe('redirects and rate limits', () => {
  it('only allows same-site relative ?next= paths', () => {
    expect(safeNext('/partners')).toBe('/partners');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
  it('allows the limit, then answers 429 RATE_LIMITED, then refills over time', () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) takeToken('t', 20, 60000, now);
    expect(codeOf(() => takeToken('t', 20, 60000, now))).toBe('RATE_LIMITED:429');
    expect(codeOf(() => takeToken('other', 20, 60000, now))).toBe('no error');
    expect(codeOf(() => takeToken('t', 20, 60000, now + 3001))).toBe('no error');
  });
  it('rejects javascript: links and missing IP confirmation in applications', () => {
    const base = {
      type: 'BRAND',
      orgName: 'Hawker Heroes',
      contactEmail: 'a@b.co',
      proposedSeries: 'Eight hawker legends as vinyl figures.',
      ipOwnership: true,
      ipStatement: 'We own the trademark and all character artwork.',
      website: 'https://example.com',
      proofUrl: 'https://example.com/licence',
    };
    expect(applicationSchema.safeParse(base).success).toBe(true);
    expect(applicationSchema.safeParse({ ...base, website: 'javascript:alert(1)' }).success).toBe(
      false,
    );
    expect(applicationSchema.safeParse({ ...base, ipOwnership: false }).success).toBe(false);
  });
});
