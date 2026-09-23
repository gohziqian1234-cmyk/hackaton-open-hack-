'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, Box, ArrowRight, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Provider, useLoop } from './provider';
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Provider>
      <Frame>{children}</Frame>
    </Provider>
  );
}
function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    router = useRouter(),
    { data, login } = useLoop(),
    [menu, setMenu] = useState(false);
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="header">
        <Link className="brand" href="/" aria-label="LoopBox home">
          <span className="brand-mark">
            <Box size={25} />
          </span>
          loopbox<span className="brand-dot">®</span>
        </Link>
        <nav className={menu ? 'nav open' : 'nav'} aria-label="Main navigation">
          <Link
            className={path === '/drop' ? 'active' : ''}
            onClick={() => setMenu(false)}
            href="/drop"
          >
            The drop <span className="live-dot" />
          </Link>
          <Link
            className={path === '/collection' ? 'active' : ''}
            onClick={() => setMenu(false)}
            href="/collection"
          >
            My collection
          </Link>
          <Link
            className={path === '/trades' ? 'active' : ''}
            onClick={() => setMenu(false)}
            href="/trades"
          >
            Trade room
          </Link>
          <Link href="/#how-it-works" onClick={() => setMenu(false)}>
            Our approach <ArrowUpRight size={12} />
          </Link>
        </nav>
        <div className="header-end">
          <button
            className="account"
            onClick={async () => {
              await login(data?.user?.role === 'BUSINESS' ? 'collector' : 'business');
              router.push(data?.user?.role === 'BUSINESS' ? '/drop' : '/studio');
            }}
          >
            <span className="avatar">{data?.user?.role === 'BUSINESS' ? 'AS' : 'A'}</span>
            <span>
              {data?.user?.role === 'BUSINESS' ? 'Demo studio' : 'Demo collector'}
              <small>
                Switch workspace <ArrowRight size={10} />
              </small>
            </span>
          </button>
          <button
            className="mobile-menu icon-button"
            aria-label={menu ? 'Close menu' : 'Open menu'}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="content">{children}</main>
      <footer>
        <Link href="/" className="brand">
          loopbox®
        </Link>
        <span>Less guesswork. More meaning.</span>
        <small>Hackathon demo · No real payments · Original fictional IP</small>
      </footer>
    </>
  );
}
export function Loading() {
  return (
    <section className="page loading-page" aria-label="Loading LoopBox">
      <span className="orbit-loader" />
      <p>Finding your constellation…</p>
    </section>
  );
}
