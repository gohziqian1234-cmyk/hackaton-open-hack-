// Password hashing with Node's built-in scrypt. No imports besides node:crypto, so
// scripts/create-admin.mjs can load this file directly.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384,
  R = 8,
  P = 1,
  KEY_LENGTH = 32;

/** Returns "scrypt$N$r$p$saltHex$hashHex". */
export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('hex'), hash.toString('hex')].join('$');
}

/** Constant-time check. Unknown or malformed hashes return false after doing the same work. */
export function verifyPassword(password: string, stored: string | null | undefined) {
  const parts = (stored ?? '').split('$');
  const valid = parts.length === 6 && parts[0] === 'scrypt';
  const [n, r, p] = valid ? parts.slice(1, 4).map(Number) : [N, R, P];
  const salt = Buffer.from(valid ? parts[4] : '00'.repeat(16), 'hex');
  const expected = Buffer.from(valid ? parts[5] : '00'.repeat(KEY_LENGTH), 'hex');
  const actual = scryptSync(password.normalize('NFKC'), salt, expected.length || KEY_LENGTH, {
    N: n,
    r,
    p,
  });
  return valid && actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Session tokens are stored hashed, so a copied database cannot be used to sign in. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
