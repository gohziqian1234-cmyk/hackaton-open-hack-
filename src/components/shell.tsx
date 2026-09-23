'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Box, LayoutGrid, Menu, Repeat2, Store, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { Provider, useLoop } from './provider';
import { Skeleton } from './ui';
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
  { href: '/drop', label: 'The drop' },
  { href: '/collection', label: 'My collection' },
  { href: '/trades', label: 'Trade room' },
  { href: '/market', label: 'Marketplace' },
  { href: '/partners', label: 'For partners' },
];
const tabs = [
  { href: '/drop', label: 'Drop', icon: Box },
  { href: '/collection', label: 'Collection', icon: LayoutGrid },
  { href: '/trades', label: 'Trades', icon: Repeat2 },
  { href: '/market', label: 'Market', icon: Store },
  { href: '/me', label: 'Me', icon: UserRound },
];
const current = (path: string, href: string) =>
  path === href || path.startsWith(href + '/') ? 'page' : undefined;
function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    router = useRouter(),
    { data, login } = useLoop(),
    [menu, setMenu] = useState(false);
  const business = data?.user?.role === 'BUSINESS';
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
          </nav>
          <div className="site-header-end">
            <button
              className={business ? 'who business' : 'who'}
              onClick={async () => {
                await login(business ? 'collector' : 'business');
                router.push(business ? '/drop' : '/studio');
              }}
            >
              <b aria-hidden="true">{business ? 'AS' : 'A'}</b>
              <span className="who-label">{business ? 'Demo studio' : 'Demo collector'}</span>
              <span className="visually-hidden">, switch workspace</span>
            </button>
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
          <p>Limited collectibles, made to confirmed demand. Hackathon demo with no real payments.</p>
          <nav aria-label="Footer">
            <Link href="/terms">Terms (draft)</Link>
          </nav>
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
