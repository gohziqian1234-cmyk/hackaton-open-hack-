'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Instagram,
  LayoutGrid,
  Menu,
  Repeat2,
  Store,
  Twitter,
  UserRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Provider, useLoop } from './provider';
import { ErrorNote, Skeleton } from './ui';
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Provider>
      <Frame>{children}</Frame>
    </Provider>
  );
}
export function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 29 10v12L16 29 3 22V10z" fill="#FFD84D" />
      <path d="M3 10l13 7 13-7M16 17v12" stroke="#17123A" strokeWidth="2.4" fill="none" />
    </svg>
  );
}
const navLinks = [
  { href: '/drops', label: 'Drops' },
  { href: '/collection', label: 'My collection' },
  { href: '/trades', label: 'Trade room' },
  { href: '/market', label: 'Marketplace' },
  { href: '/partners', label: 'For partners' },
];
const tabs = [
  { href: '/drops', label: 'Drops', icon: Box },
  { href: '/collection', label: 'Collection', icon: LayoutGrid },
  { href: '/trades', label: 'Trades', icon: Repeat2 },
  { href: '/market', label: 'Market', icon: Store },
  { href: '/me', label: 'Me', icon: UserRound },
];
const current = (path: string, href: string) =>
  path === href || path.startsWith(href + '/') || (href === '/drops' && path === '/drop')
    ? 'page'
    : undefined;
function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    router = useRouter(),
    { data, login } = useLoop(),
    [menu, setMenu] = useState(false);
  const waiting = (data?.items ?? []).filter((i) => i.state === 'opened').length;
  const role = data?.user?.role,
    business = role === 'BUSINESS',
    admin = role === 'ADMIN',
    // Real accounts (and everyone when demo mode is off) get a plain account chip.
    realUser = !!data?.user && !data.identities.some((i) => i.id === data.user?.id),
    plain = !!data && (!data.demo || realUser),
    // Other seeded collectors (Sarah, Mei, Jun, Priya) are named, so a seller never looks like Alex.
    other =
      data?.user && role === 'COLLECTOR' && data.user.id !== 'collector' ? data.user.name : '';
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="logo" href="/" aria-label="LoopBox home">
            <LogoMark />
            loopbox
          </Link>
          <nav className={menu ? 'site-nav open' : 'site-nav'} aria-label="Main navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current(path, link.href)}
                onClick={() => setMenu(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/checkout"
              className="nav-checkout"
              aria-current={current(path, '/checkout')}
              onClick={() => setMenu(false)}
            >
              Checkout
              {waiting > 0 && (
                <span className="nav-badge" aria-label={`${waiting} waiting`}>
                  {waiting}
                </span>
              )}
            </Link>
          </nav>
          <div className="site-header-end">
            {plain ? (
              <Link className="who" href={data?.user ? '/me' : '/login'}>
                <b aria-hidden="true">
                  {data?.user ? data.user.name.slice(0, 1).toUpperCase() : '?'}
                </b>
                <span className="who-label">{data?.user ? data.user.name : 'Sign in'}</span>
              </Link>
            ) : (
              <button
                className={admin ? 'who admin' : business ? 'who business' : 'who'}
                onClick={async () => {
                  const toStudio = !business && !admin;
                  await login(toStudio ? 'business' : 'collector');
                  router.push(toStudio ? '/studio' : '/drops');
                }}
              >
                <b aria-hidden="true">{admin ? 'AD' : business ? 'AS' : other ? other[0] : 'A'}</b>
                <span className="who-label">
                  {admin
                    ? 'Demo admin'
                    : business
                      ? 'Demo studio'
                      : other
                        ? 'Demo ' + other
                        : 'Demo collector'}
                </span>
                <span className="visually-hidden">, switch workspace</span>
              </button>
            )}
            <button
              className="menu-button"
              aria-label={menu ? 'Close menu' : 'Open menu'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="content">{children}</main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <Link href="/" className="logo">
            <LogoMark />
            loopbox
          </Link>
          <p className="footer-tag">Limited collectibles, made to confirmed demand.</p>
          <nav aria-label="Footer" className="footer-nav">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
            <Link href="/terms">Terms (draft)</Link>
          </nav>
          <p className="footer-social">
            <Instagram size={18} aria-hidden="true" />
            <Twitter size={18} aria-hidden="true" />
            <span>Social accounts open after the hackathon.</span>
          </p>
          <p className="footer-demo">
            Hackathon demo — no real payments except the Astral Kin test drop.
          </p>
        </div>
      </footer>
      <nav className="tabbar" aria-label="Tabs">
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href} aria-current={current(path, tab.href)}>
            <tab.icon size={22} aria-hidden="true" />
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
export function Loading() {
  return (
    <section className="wrap skeleton-page" role="status" aria-label="Loading LoopBox">
      <Skeleton width="40%" height={20} />
      <Skeleton width="70%" height={56} />
      <Skeleton width="55%" height={20} />
      <Skeleton height={280} />
    </section>
  );
}
/** Loading skeleton, or an error with a retry when the first snapshot failed. */
export function Pending() {
  const { loadFailed, retry } = useLoop();
  if (loadFailed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="We couldn’t load the drop." onRetry={retry}>
          Check your connection, then try again. Nothing you bought has been lost.
        </ErrorNote>
      </section>
    );
  return <Loading />;
}
