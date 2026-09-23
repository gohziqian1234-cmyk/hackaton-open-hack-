import { describe, expect, it } from 'vitest';
import { checkEnv } from '../scripts/check-env.mjs';

type Result = { errors: string[]; warnings: string[] };
const check = (env: Record<string, string>) => checkEnv(env as NodeJS.ProcessEnv) as Result;

describe('startup configuration check', () => {
  it('accepts the documented defaults and the Render blueprint', () => {
    expect(
      check({ DEMO_MODE: 'true', SIMULATE_PAYMENTS: 'true', MAX_CHARGE_CENTS: '100000' }).errors,
    ).toEqual([]);
    const render = check({
      HOSTNAME: '0.0.0.0',
      DEMO_MODE: 'true',
      ADMIN_DEMO: 'true',
      SIMULATE_PAYMENTS: 'true',
      HTTPS_ONLY: 'true',
      COOKIE_SECURE: 'true',
      MAX_CHARGE_CENTS: '100000',
    });
    expect(render.errors).toEqual([]);
    expect(render.warnings.join(' ')).toMatch(/ADMIN_DEMO is on for a public host/);
  });
  it('refuses live Stripe keys, malformed webhook secrets and secrets in NEXT_PUBLIC_ variables', () => {
    expect(check({ STRIPE_SECRET_KEY: 'sk_live_x' }).errors[0]).toMatch(/not a test-mode key/);
    expect(
      check({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'nope' }).errors[0],
    ).toMatch(/whsec_/);
    expect(check({ NEXT_PUBLIC_KEY: 'sk_test_abc' }).errors[0]).toMatch(/looks like a secret/);
    // No error or warning ever repeats the secret value.
    const all = Object.values(
      check({ STRIPE_SECRET_KEY: 'sk_live_TOPSECRET', NEXT_PUBLIC_X: 'whsec_TOPSECRET' }),
    ).flat();
    expect(all.join(' ')).not.toContain('TOPSECRET');
  });
  it('refuses a broken spending cap, bad booleans and an http app URL under HTTPS_ONLY', () => {
    expect(check({ MAX_CHARGE_CENTS: '0' }).errors).toHaveLength(1);
    expect(check({ MAX_CHARGE_CENTS: '99999999' }).errors).toHaveLength(1);
    expect(check({ DEMO_MODE: 'yes' }).errors[0]).toMatch(/DEMO_MODE must be/);
    expect(
      check({ HTTPS_ONLY: 'true', NEXT_PUBLIC_APP_URL: 'http://example.com' }).errors[0],
    ).toMatch(/not https/);
    expect(check({ NEXT_PUBLIC_APP_URL: 'javascript:alert(1)' }).errors[0]).toMatch(/http\(s\)/);
  });
});
