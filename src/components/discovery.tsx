'use client';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Gamepad2,
  Repeat2,
  PackageCheck,
  Check,
  LockKeyhole,
} from 'lucide-react';
import { Stage } from './stage';
import { KinArt } from './art';
import { useLoop } from './provider';
import { characters, money } from '../lib/catalog';
import { Loading } from './shell';
import { useRouter } from 'next/navigation';
export function Discovery() {
  const { data } = useLoop();
  const claimed = data?.campaign.confirmed ?? 93,
    cap = data?.campaign.capacity ?? 100;
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" /> SMALL BATCHES. BIG POSSIBILITIES.
          </div>
          <h1>
            A little mystery.
            <br />A better way
            <br />
            to <em>collect.</em>
          </h1>
          <p>
            Play for your place. Meet your next favourite.
            <br className="desktop-break" /> We only make what finds a home.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/drop">
              Explore the drop <ArrowUpRight size={19} />
            </Link>
            <a className="text-link" href="#how-it-works">
              A different kind of collectible <ArrowRight size={16} />
            </a>
          </div>
          <div className="edition-note">
            <span className="mini-orbit">✳</span>
            <div>
              Thoughtfully limited.
              <br />
              <strong>Never made for a shelf somewhere.</strong>
            </div>
          </div>
        </div>
        <div className="hero-gallery">
          <div className="gallery-top">
            <span>LOOPBOX ORIGINALS</span>
            <span>COLLECTION NO. 001</span>
          </div>
          <div className="orbital-lines">
            <i />
            <i />
          </div>
          <div className="big-astral" aria-hidden="true">
            ASTRAL
          </div>
          <Stage />
          <div className="object-caption">
            <span className="crosshair">+</span>
            <span>
              THE FIRST CONSTELLATION
              <br />
              <strong>Seven souls. One universe.</strong>
            </span>
          </div>
          <div className="gallery-bottom">
            <div>
              <span className="eyebrow">FRAGMENTS BEYOND THE STARS</span>
              <h2>
                Astral Kin<span>™</span>
              </h2>
            </div>
            <span className="edition-pill">
              100
              <br />
              <small>ONLY</small>
            </span>
          </div>
        </div>
      </section>
      <section className="drop-strip">
        <div>
          <span className="live-dot" />
          <strong>THE FIRST DROP IS LIVE</strong>
          <span className="strip-muted">One box. A world of possibility.</span>
        </div>
        <div className="strip-cap">
          <span>
            <strong>{claimed}</strong> / {cap} claimed
          </span>
          <div className="progress">
            <i style={{ width: Math.min(100, (claimed / cap) * 100) + '%' }} />
          </div>
        </div>
        <Link href="/drop">
          Find your Astral Kin <ArrowUpRight size={18} />
        </Link>
      </section>
      <section className="approach" id="how-it-works">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A SMALL SHIFT. A BETTER CYCLE.</p>
            <h2>
              The joy of the unknown.
              <br />
              <span>Without the unnecessary.</span>
            </h2>
          </div>
          <p>
            The surprise stays. The excess doesn’t.
            <br />
            Your journey shapes what we make.
          </p>
        </div>
        <div className="steps">
          {[
            {
              icon: Gamepad2,
              title: 'Play your way in.',
              copy: 'A short quest. A little skill. Earn access to one limited blind-box preorder.',
            },
            {
              icon: Sparkles,
              title: 'Meet your mystery.',
              copy: 'Open your box digitally and discover your Astral Kin before it’s made.',
            },
            {
              icon: Repeat2,
              title: 'Find your favourite.',
              copy: 'Keep your kin or exchange with a collector in the same rarity tier.',
            },
            {
              icon: PackageCheck,
              title: 'Then, we make.',
              copy: 'When allocations are final, we manufacture only confirmed orders in-house.',
            },
          ].map((s, i) => (
            <article key={s.title}>
              <div className="step-top">
                <s.icon size={25} strokeWidth={1.3} />
                <span>0{i + 1}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="manifesto">
        <span className="eyebrow">MADE WITH INTENTION</span>
        <h2>
          A collection of things you love.
          <br />
          Not a warehouse of things you might.
        </h2>
        <Link className="text-link" href="/drop">
          Be part of the first constellation <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}
export function Drop() {
  const { data, login, busy, act } = useLoop(),
    router = useRouter();
  if (!data) return <Loading />;
  const c = data.campaign,
    remaining = c.capacity - c.confirmed,
    closed = c.phase !== 'ACTIVE_PREORDER' || data.serverTime >= c.ends_at,
    limit = data.purchases >= c.max_per_user;
  const enter = async () => {
    if (!data.user || data.user.role !== 'COLLECTOR') await login('collector');
    router.push(data.access.length ? '/checkout' : '/quest');
  };
  return (
    <section className="page drop-page">
      <div className="breadcrumb">
        <Link href="/">Discover</Link>
        <span>/</span>Astral Kin · Series 01
      </div>
      <div className="drop-grid">
        <div className="drop-display">
          <div className="gallery-top">
            <span>ORIGINAL DESIGN · SERIES 01</span>
            <span>01 / 07</span>
          </div>
          <Stage />
          <div className="display-label">
            <span>ARTIST’S PREVIEW</span>
            <p>
              Your character is a surprise.
              <br />
              Every box belongs to this constellation.
            </p>
          </div>
        </div>
        <div className="drop-info">
          <p className="eyebrow">
            <span className="live-dot" />
            {closed
              ? 'PREORDER ' + c.phase.replaceAll('_', ' ')
              : remaining > 0
                ? 'LIMITED PREORDER · LIVE NOW'
                : 'THIS CONSTELLATION IS FULL'}
          </p>
          <h1>
            {c.name}
            <sup>™</sup>
          </h1>
          <p className="subtitle">Fragments beyond the stars.</p>
          <p className="description">{c.description}</p>
          <div className="price">
            <strong>{money(c.price)}</strong>
            <span>SGD / one mystery blind box</span>
          </div>
          <div className="capacity">
            <div>
              <strong>
                {c.confirmed} <span>/ {c.capacity} claimed</span>
              </strong>
              <span>{Math.max(0, remaining)} remaining</span>
            </div>
            <div className="progress">
              <i style={{ width: (c.confirmed / c.capacity) * 100 + '%' }} />
            </div>
            <small>
              {closed
                ? 'Preorders closed'
                : `Closes ${new Date(c.ends_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`}{' '}
              · Up to {c.max_per_user} per collector · {data.purchases} owned purchases
            </small>
          </div>
          {remaining <= 0 ? (
            <button
              className="button primary wide"
              disabled={busy || data.waitlisted}
              onClick={async () => {
                if (!data.user) await login('collector');
                await act({ action: 'waitlist' });
              }}
            >
              {data.waitlisted ? 'You’re on the waitlist' : 'Sold out · Join waitlist'}{' '}
              <Check size={18} />
            </button>
          ) : (
            <button
              className="button primary wide"
              disabled={busy || closed || limit}
              onClick={enter}
            >
              {limit
                ? 'Your collection is complete'
                : closed
                  ? 'Preorders closed'
                  : data.access.length
                    ? 'Claim preorder slot'
                    : 'Play to unlock'}
              {!closed && !limit && <ArrowUpRight size={20} />}
            </button>
          )}
          <p className="fine centered">
            No pay-to-play. No guaranteed character. Just a little discovery.
          </p>
          <div className="drop-benefits">
            <span>
              <LockKeyhole size={16} /> Earn your access
            </span>
            <span>
              <Repeat2 size={16} /> Trade before production
            </span>
          </div>
        </div>
      </div>
      <div className="section-heading lineup-heading">
        <div>
          <p className="eyebrow">MEET THE CONSTELLATION</p>
          <h2>Seven kin. Who will find you?</h2>
        </div>
        <p>
          4 common · 2 rare · 1 secret
          <br />
          Equal-tier exchanges. No rerolls.
        </p>
      </div>
      <div className="lineup">
        {characters.map((ch, i) => (
          <article key={ch.id} style={{ '--kin-color': ch.color } as React.CSSProperties}>
            <span className="kin-number">0{i + 1}</span>
            <KinArt id={ch.id} />
            <span className={'rarity ' + ch.rarity.toLowerCase()}>{ch.rarity}</span>
            <h3>{ch.name}</h3>
            <p>{ch.description}</p>
          </article>
        ))}
      </div>
      <p className="fine">
        Demo disclosure: your first new box reveals Eclipse Knight to make the trading walkthrough
        repeatable. Real-money purchases are not available.
      </p>
    </section>
  );
}
