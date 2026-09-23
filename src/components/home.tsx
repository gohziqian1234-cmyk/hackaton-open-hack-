'use client';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CreditCard,
  Factory,
  Gamepad2,
  Handshake,
  KeyRound,
  Leaf,
  PackageOpen,
  Printer,
  Repeat2,
  Users,
} from 'lucide-react';
import { Stage } from './stage';
import { useCampaign } from './provider';
import { Pending } from './shell';
import { Button } from './ui';
import { ConceptBadge } from './character-image';
import { SegmentedMeter, ThemeCover, closesIn, useRevealOnScroll } from './drops-ui';
import { CheckoutBanner } from './checkout-banner';
import type { Snapshot, ThemeInfo } from '../lib/types';

const steps = [
  { title: 'Play', copy: 'A short themed quest. Free for everyone.', icon: Gamepad2 },
  { title: 'Unlock', copy: 'Win one preorder slot, held for 15 minutes.', icon: KeyRound },
  { title: 'Open', copy: 'Open a digital blind box drawn from a published shuffle.', icon: PackageOpen },
  { title: 'Trade', copy: 'Swap a pull you don’t want for one of the same rarity.', icon: Repeat2 },
  { title: 'Confirm & pay', copy: 'Tell us you want it made, then pay at checkout.', icon: CreditCard },
  { title: 'We produce', copy: 'Only confirmed figures are 3D-printed and shipped.', icon: Factory },
];

/** Where the signed-in collector is in the six steps, or -1 when signed out. */
function currentStep(data: Snapshot) {
  if (!data.user || data.user.role !== 'COLLECTOR') return -1;
  const items = data.items ?? [];
  if (items.some((i) => i.state === 'opened')) return 4;
  if (data.access.length) return 2;
  if (items.some((i) => i.state === 'confirmed')) return 5;
  if (data.collection.length) return 3;
  return 0;
}

/** Hand-drawn underline that draws itself in once (static under reduced motion). */
function Scribble() {
  return (
    <svg className="scribble" viewBox="0 0 420 24" preserveAspectRatio="none" aria-hidden="true">
      <path d="M4 16c38-6 77-9 118-8 31 1 52 5 86 4 48-2 93-9 141-8 22 0 41 2 66 6" />
    </svg>
  );
}

function NowDropping({ themes, now }: { themes: ThemeInfo[]; now: number }) {
  const live = themes.filter((t) => t.status === 'live' && t.sort_order < 1000).slice(0, 3);
  if (!live.length) return null;
  return (
    <section className="now-dropping" aria-labelledby="now-heading" data-reveal>
      <div className="section-head">
        <h2 id="now-heading">Now dropping</h2>
        <Link className="text-link" href="/drops">
          All drops <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <ul className="nd-grid">
        {live.map((t, i) => {
          const left = Math.max(0, (t.capacity ?? 0) - t.claimed);
          return (
            <li key={t.slug} className={i === 0 ? 'nd-big' : 'nd-small'}>
              <Link href={'/drops/' + t.slug} className="nd-card">
                <ThemeCover theme={t} />
                <div className="nd-body">
                  <span className="tag-live">Live</span>
                  <h3>{t.name}</h3>
                  <p>
                    {left} left · closes in {closesIn(t.closes_at, now)}
                  </p>
                  <ConceptBadge theme={t} compact />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Home() {
  const data = useCampaign('astral');
  const root = useRevealOnScroll<HTMLDivElement>();
  if (!data) return <Pending />;
  const themes = data.themes;
  const featured = themes.find((t) => t.campaign_id === 'astral') ?? themes[0];
  const claimed = data.campaign.confirmed,
    cap = data.campaign.capacity,
    left = Math.max(0, cap - claimed),
    step = currentStep(data);
  const partnerDrops = themes.filter((t) => t.sort_order >= 1000);
  return (
    <div className="home" ref={root}>
      <section className="home-hero grid-12">
        <div className="hh-copy">
          <p className="eyebrow">
            <Leaf size={18} aria-hidden="true" /> Collect more consciously
          </p>
          <h1>
            Collect the surprise. Produce{' '}
            <span className="underlined">
              only what’s wanted.
              <Scribble />
            </span>
          </h1>
          <p className="hh-sub">
            Play a short quest, unlock a preorder slot, open a digital blind box and trade what you
            don’t want. Only confirmed orders get made. Real collectibles, less waste.
          </p>
          <div className="hh-cta">
            <Button href="/drops" className="btn-pill">
              Explore the drops
            </Button>
            <Link className="text-link" href="/verify/astral">
              How the draw stays fair
            </Link>
          </div>
          <div className="live-status" aria-label={`${featured?.name ?? 'Astral Kin'} live status`}>
            <div className="ls-top">
              <span className="dot-live">{featured?.name ?? 'Astral Kin'} is live</span>
              <strong className="tabular">
                {claimed}/{cap}
              </strong>
            </div>
            <SegmentedMeter claimed={claimed} capacity={cap} />
            <p className="ls-label tabular">
              {left} left · closes in {closesIn(data.campaign.ends_at, data.serverTime)}
            </p>
          </div>
          <CheckoutBanner />
        </div>
        <div className="hh-visual">
          <div className="hh-glow" aria-hidden="true" />
          <Stage />
          <div className="sticker" role="img" aria-label={`${claimed} of ${cap} boxes claimed`}>
            <b className="tabular">{claimed}</b>
            <span>of {cap} claimed</span>
          </div>
        </div>
      </section>

      <section className="value-band" aria-label="Why LoopBox" data-reveal>
        <div>
          <Handshake size={28} aria-hidden="true" />
          <h2 className="h3">Brand partnerships</h2>
          <p>We work with brands and creators to launch themed, limited drops.</p>
        </div>
        <div>
          <Printer size={28} aria-hidden="true" />
          <h2 className="h3">Made in-house</h2>
          <p>Every confirmed figure is 3D-printed in our own studio.</p>
        </div>
        <div>
          <Leaf size={28} aria-hidden="true" />
          <h2 className="h3">No overstock risk</h2>
          <p>We only produce confirmed demand, so nothing sits unsold.</p>
        </div>
      </section>

      <section className="how-works" aria-labelledby="how-heading" data-reveal>
        <div className="section-head">
          <h2 id="how-heading">How LoopBox works</h2>
          <p className="muted">A new way to collect. Better for fans, kinder to the planet.</p>
        </div>
        <ol className="works-line">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={i === step ? 'is-current' : i < step ? 'is-done' : undefined}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="node tabular">{i + 1}</span>
              <s.icon size={22} aria-hidden="true" className="tl-icon" />
              <h3>{s.title}</h3>
              <p>{s.copy}</p>
              {i === step && <span className="you-are-here">You are here</span>}
            </li>
          ))}
        </ol>
      </section>

      <NowDropping themes={themes} now={data.serverTime} />

      {partnerDrops.length > 0 && (
        <section className="more-drops" aria-labelledby="more-heading" data-reveal>
          <h2 id="more-heading">More drops</h2>
          <ul className="md-list">
            {partnerDrops.map((t) => (
              <li key={t.slug}>
                <div>
                  <h3>{t.name}</h3>
                  <p className="muted">
                    {t.partner ? `By ${t.partner}. ` : ''}
                    {Math.max(0, (t.capacity ?? 0) - t.claimed)} of {t.capacity} left.
                  </p>
                </div>
                <Button href={'/drops/' + t.slug} variant="ghost">
                  See the {t.name} drop
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ecosystem" aria-labelledby="eco-heading" data-reveal>
        <h2 id="eco-heading">From iconic brands to real collectibles</h2>
        <ol className="eco-flow">
          <li>
            <Building2 size={26} aria-hidden="true" />
            <h3>Brand / theme partner</h3>
            <p>Partner IP becomes a limited drop.</p>
          </li>
          <li>
            <Users size={26} aria-hidden="true" />
            <h3>Collectors</h3>
            <p>Play, open, trade and confirm.</p>
          </li>
          <li>
            <Factory size={26} aria-hidden="true" />
            <h3>In-house production</h3>
            <p>Only confirmed demand is made.</p>
          </li>
        </ol>
        <p className="eco-tag">Same passion. Less waste.</p>
      </section>
    </div>
  );
}
