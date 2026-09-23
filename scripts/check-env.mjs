// Validates the server environment before start. Refuses configurations that could take real money,
// leak a secret to the browser, or disable a safety rail; warns about risky demo settings.
// Never prints a secret value. Run directly: node scripts/check-env.mjs
import { pathToFileURL } from 'node:url';

const BOOL = ['true', 'false'];

/** Returns { errors, warnings } for an environment object (process.env by default). */
export function checkEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const key = env.STRIPE_SECRET_KEY ?? '';
  const hook = env.STRIPE_WEBHOOK_SECRET ?? '';
  if (key && !/^(sk|rk)_test_/.test(key))
    errors.push(
      'STRIPE_SECRET_KEY is not a test-mode key. This demo only runs with sk_test_/rk_test_ keys.',
    );
  if (hook && !hook.startsWith('whsec_'))
    errors.push('STRIPE_WEBHOOK_SECRET must start with whsec_.');
  if (key && !hook)
    warnings.push(
      'STRIPE_SECRET_KEY is set without STRIPE_WEBHOOK_SECRET: every webhook will be rejected.',
    );
  for (const [name, value] of Object.entries(env))
    if (name.startsWith('NEXT_PUBLIC_') && /(sk|rk)_(test|live)_|whsec_|scrypt\$/.test(value ?? ''))
      errors.push(`${name} looks like a secret. NEXT_PUBLIC_ variables are sent to every browser.`);
  for (const name of [
    'DEMO_MODE',
    'ADMIN_DEMO',
    'SIMULATE_PAYMENTS',
    'HTTPS_ONLY',
    'COOKIE_SECURE',
  ])
    if (env[name] !== undefined && env[name] !== '' && !BOOL.includes(env[name]))
      errors.push(`${name} must be "true" or "false".`);
  if (env.MAX_CHARGE_CENTS) {
    const cap = Number(env.MAX_CHARGE_CENTS);
    if (!Number.isInteger(cap) || cap < 100 || cap > 1000000)
      errors.push('MAX_CHARGE_CENTS must be a whole number of cents between 100 and 1000000.');
  }
  if (env.NEXT_PUBLIC_APP_URL) {
    let url = null;
    try {
      url = new URL(env.NEXT_PUBLIC_APP_URL);
    } catch {
      errors.push('NEXT_PUBLIC_APP_URL is not a valid URL.');
    }
    if (url && !['http:', 'https:'].includes(url.protocol))
      errors.push('NEXT_PUBLIC_APP_URL must be http(s).');
    if (url && env.HTTPS_ONLY === 'true' && url.protocol !== 'https:')
      errors.push('HTTPS_ONLY=true but NEXT_PUBLIC_APP_URL is not https.');
  }
  const publicHost = env.HOSTNAME === '0.0.0.0' || env.HTTPS_ONLY === 'true';
  const demo = env.DEMO_MODE !== 'false';
  if (publicHost && demo)
    warnings.push(
      'DEMO_MODE is on for a public host: anyone can switch between the demo accounts.',
    );
  if (publicHost && demo && env.ADMIN_DEMO !== 'false')
    warnings.push(
      'ADMIN_DEMO is on for a public host: anyone can open the admin console. Set ADMIN_DEMO=false outside a judged demo.',
    );
  if (publicHost && env.HTTPS_ONLY !== 'true')
    warnings.push('HTTPS_ONLY is not true on a public host: HSTS is off.');
  if (Number(env.RATE_LIMIT_SCALE) > 1)
    warnings.push('RATE_LIMIT_SCALE raises every rate limit. Use it only for load tests.');
  return { errors, warnings };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { errors, warnings } = checkEnv();
  for (const w of warnings) console.warn('LoopBox config warning:', w);
  for (const e of errors) console.error('LoopBox config error:', e);
  if (errors.length) process.exit(1);
  console.log('LoopBox config OK.');
}
