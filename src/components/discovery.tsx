'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Stage } from './stage';
import { KinArt } from './art';
import { useLoop } from './provider';
import { characters, sgd } from '../lib/catalog';
import { Pending } from './shell';
import { Button, Perforation, Stat, Tier } from './ui';

const steps = [
  { title: 'Play', copy: 'Beat the fragment run or the lore challenge. Playing is free.' },
  { title: 'Pay', copy: 'Your slot is held for 15 minutes. Pay the full box price.' },
  { title: 'Open', copy: 'Your box is drawn from a shuffle we published before the drop.' },
  { title: 'Trade', copy: 'Swap a duplicate for another kin of the same rarity.' },
  { title: 'We make it', copy: 'Only confirmed boxes go to production, then we ship.' },
];

export function Discovery() {
  const { data } = useLoop();
  const claimed = data?.campaign.confirmed ?? 93,
    cap = data?.campaign.capacity ?? 100,
    remaining = Math.max(0, cap - claimed);
  return (
    <div className="wrap">
      <section className="hero">
        <div className="hero-copy">
          <span className="live">Astral Kin drop is live</span>
          <h1>
            <span>A little mystery,</span> <span>made to order.</span>
          </h1>
          <p>
            Win a slot in a short game, pay for one blind box, and open it right away. We only make
            the boxes people actually bought.
          </p>
          <div className="hero-cta">
            <Button href="/drop">Explore the drop</Button>
            <Button href="/verify/astral" variant="quiet">
              How the draw stays fair
            </Button>
          </div>
        </div>
        <div className="boxstage">
          <Stage />
          <div className="stamp" role="img" aria-label={`${claimed} of ${cap} boxes claimed`}>
            {claimed}
            <small>
              of {cap}
              <br />
              claimed
            </small>
          </div>
        </div>
      </section>
      <div className="meter">
        <span className="live">{remaining} remaining</span>
        <div className="bar" role="img" aria-label={`${claimed} of ${cap} claimed`}>
          <i style={{ width: Math.min(100, (claimed / cap) * 100) + '%' }} />
        </div>
        <strong>
          {claimed}/{cap}
        </strong>
      </div>
      <section className="how" aria-labelledby="how-heading">
        <h2 id="how-heading">How a drop works</h2>
        <ol className="steps">
          {steps.map((step) => (
            <li className="step" key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function Drop() {
  const { data, login, busy, act } = useLoop(),
    router = useRouter();
  if (!data) return <Pending />;
  const c = data.campaign,
    remaining = Math.max(0, c.capacity - c.confirmed),
    closed = c.phase !== 'ACTIVE_PREORDER' || data.serverTime >= c.ends_at,
    limit = data.purchases >= c.max_per_user,
    days = Math.max(0, Math.ceil((c.ends_at - data.serverTime) / 86400000));
  const enter = async () => {
    if (!data.user || data.user.role !== 'COLLECTOR') await login('collector');
    router.push(data.access.length ? '/checkout' : '/quest');
  };
  return (
    <section className="wrap drop">
      <div className="drop-main">
        <span className={closed ? 'live closed' : 'live'}>
          {remaining > 0 ? `${remaining} remaining` : 'Sold out'}
        </span>
        <h1>
          {c.name}
          <span className="tm">™</span>
        </h1>
        <p className="lead">{c.description}</p>
        <h2 className="h3 lineup-title">The lineup. One box holds one kin, and you can’t pick which.</h2>
        <ul className="lineup">
          {characters.map((ch) => {
            const secret = ch.rarity === 'SECRET';
            return (
              <li
                key={ch.id}
                className={'kin ' + ch.rarity.toLowerCase()}
                style={{ '--kin-color': ch.color } as React.CSSProperties}
              >
                <KinArt id={ch.id} silhouette={secret} />
                <h3>{secret ? 'Secret kin' : ch.name}</h3>
                <Tier rarity={ch.rarity} />
                <span className="odds">
                  {ch.units} of {c.capacity} boxes
                </span>
              </li>
            );
          })}
        </ul>
        <p className="note drop-disclosure">
          Every box was shuffled before the drop opened and the fingerprint was published.{' '}
          <Link href={'/verify/' + c.id}>Check the draw yourself</Link>. Demo note: the demo uses a
          fixed shuffle, so the next box is always Eclipse Knight and the walkthrough is
          repeatable. No real money is taken.
        </p>
      </div>
      <aside className="panel buy" aria-label="Buy a box">
        <Tier rarity="RARE">{closed ? 'Preorder closed' : 'Preorder open'}</Tier>
        <div className="price">{sgd(c.price)}</div>
        <p>One sealed blind box, made after the preorder closes.</p>
        <dl className="facts">
          <Stat label="Left" value={`${remaining} of ${c.capacity}`} />
          <Stat label="Per person" value={`${c.max_per_user} max`} />
          <Stat label="Slot hold" value="15 min" />
          <Stat label="Closes" value={closed ? 'Closed' : days === 1 ? '1 day' : `${days} days`} />
        </dl>
        <Perforation />
        {remaining <= 0 ? (
          <Button
            wide
            disabled={busy || data.waitlisted}
            onClick={async () => {
              if (!data.user) await login('collector');
              await act({ action: 'waitlist' });
            }}
          >
            {data.waitlisted ? 'You’re on the waitlist' : 'Sold out · Join waitlist'}
          </Button>
        ) : (
          <Button wide disabled={busy || closed || limit} onClick={enter}>
            {limit
              ? 'Your collection is complete'
              : closed
                ? 'Preorders closed'
                : data.access.length
                  ? 'Claim preorder slot'
                  : 'Play to unlock'}
          </Button>
        )}
        <p className="odds-note">
          Free to play. No purchase needed to try the game. Odds are shown on every character.
          {data.purchases > 0 && ` You have bought ${data.purchases} of ${c.max_per_user}.`}
        </p>
      </aside>
    </section>
  );
}
