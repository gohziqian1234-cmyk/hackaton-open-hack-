'use client';
import { useEffect, useRef } from 'react';
import { BoxArt, KinArt } from './art';
import { getThemeCover, hasOriginalArt } from '../lib/images';
import type { ThemeInfo } from '../lib/types';

/** "6d 14h", "5h 12m", "12m" or "closed". */
export function closesIn(closesAt: number | null, now: number) {
  if (!closesAt) return '—';
  const ms = closesAt - now;
  if (ms <= 0) return 'closed';
  const m = Math.floor(ms / 60000),
    d = Math.floor(m / 1440),
    h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${Math.max(1, m)}m`;
}

/** Whole-percent odds for one character: units / cap. */
export const odds = (units: number, capacity: number) =>
  capacity > 0 ? Math.round((units / capacity) * 100) + '%' : '—';

/** "2 common · 1 rare · 1 secret" */
export function rarityMix(mix: ThemeInfo['mix']) {
  return (['COMMON', 'RARE', 'SECRET'] as const)
    .filter((r) => mix[r] > 0)
    .map((r) => `${mix[r]} ${r.toLowerCase()}`)
    .join(' · ');
}

/** Claimed-of-cap bar made of 20 blocks, each 5% of the cap. */
export function SegmentedMeter({ claimed, capacity }: { claimed: number; capacity: number }) {
  const filled = capacity > 0 ? Math.min(20, Math.round((claimed / capacity) * 20)) : 0;
  return (
    <div
      className="segments"
      role="img"
      aria-label={`${claimed} of ${capacity} claimed`}
      style={{ ['--filled' as string]: filled }}
    >
      {Array.from({ length: 20 }, (_, i) => (
        <i key={i} className={i < filled ? 'on' : undefined} />
      ))}
    </div>
  );
}

/** Coming-soon art: mesh gradient from the theme accent, noise, and the name in outline type. */
export function AbstractArt({ theme, className = '' }: { theme: ThemeInfo; className?: string }) {
  return (
    <div
      className={('abstract-art ' + className).trim()}
      style={{ ['--art-accent' as string]: theme.accent }}
      aria-hidden="true"
    >
      <span className="abstract-name">{theme.name}</span>
    </div>
  );
}

/** Astral Kin has no photo: its cover is composed from its own drawn kin and box. */
function OriginalCover({ theme }: { theme: ThemeInfo }) {
  return (
    <div className="original-cover" style={{ ['--art-accent' as string]: theme.accent }} aria-hidden="true">
      <BoxArt className="oc-box" />
      <KinArt id="tide" className="oc-kin oc-a" />
      <KinArt id="eclipse" className="oc-kin oc-b" />
      <KinArt id="aurora" className="oc-kin oc-c" />
    </div>
  );
}

/** The 16:10 image for a theme card or strip: cover.webp, original art or abstract art. */
export function ThemeCover({
  theme,
  eager = false,
  className = '',
}: {
  theme: ThemeInfo;
  eager?: boolean;
  className?: string;
}) {
  const cover = theme.status === 'live' ? getThemeCover(theme.slug) : null;
  return (
    <div className={('theme-cover ' + className).trim()}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover.src}
          width={cover.width}
          height={cover.height}
          alt={`${theme.name} drop cover${theme.licensed ? ' (concept render)' : ''}`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : theme.status === 'live' && hasOriginalArt(theme.slug) ? (
        <OriginalCover theme={theme} />
      ) : (
        <AbstractArt theme={theme} />
      )}
    </div>
  );
}

/** Fades sections in by 16px on first scroll into view. Off under reduced motion. */
export function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;
    const targets = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            observer.unobserve(e.target);
          }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    for (const t of targets) {
      // Only hide what is still below the fold, so nothing visible ever blinks.
      if (t.getBoundingClientRect().top > innerHeight) {
        t.classList.add('reveal-pending');
        observer.observe(t);
      }
    }
    return () => observer.disconnect();
  }, []);
  return ref;
}
