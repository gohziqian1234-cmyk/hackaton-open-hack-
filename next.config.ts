import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';
// Set HTTPS_ONLY=true on hosts that always serve HTTPS. Left off for the plain-HTTP laptop backup,
// where upgrading requests to https:// would break every asset.
const httpsOnly = process.env.HTTPS_ONLY === 'true';

// No third-party scripts, styles, fonts or frames: everything is served from this origin.
// 'unsafe-inline' for scripts is what Next.js needs without per-request nonces (see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Without Nonces").
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  ...(httpsOnly ? ['upgrade-insecure-requests'] : []),
].join('; ');

const config: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  serverExternalPackages: ['node:sqlite'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          {
            key: 'Permissions-Policy',
            value:
              // Camera on this origin only: the QR scanner in My collection → Add more.
              'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          ...(httpsOnly
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
            : []),
        ],
      },
    ];
  },
};
export default config;
