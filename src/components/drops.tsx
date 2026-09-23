'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Check, X } from 'lucide-react';
import { useCampaign, useLoop } from './provider';
import { Pending } from './shell';
import { Button, Empty, Perforation, Stat, Tier } from './ui';
import { CharacterImage, ConceptBadge, ConceptCaption } from './character-image';
import { AbstractArt, ThemeCover, closesIn, odds, rarityMix } from './drops-ui';
import { sgd } from '../lib/catalog';
import { campaignQuery } from '../lib/links';
import type { CharacterInfo, Snapshot, ThemeInfo } from '../lib/types';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live now' },
  { id: 'soon', label: 'Coming soon' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function ThemeCard({ theme, now }: { theme: ThemeInfo; now: number }) {
  const live = theme.status === 'live';
  const left = Math.max(0, (theme.capacity ?? 0) - theme.claimed);
  const characters = theme.mix.COMMON + theme.mix.RARE + theme.mix.SECRET;
  return (
    <li>
      <Link
        href={'/drops/' + theme.slug}
        className="theme-card"
        style={{ ['--theme-accent' as string]: theme.accent }}
      >
        <div className="tc-media">
          <ThemeCover theme={theme} />
          <span className={live ? 'tc-tag live' : 'tc-tag soon'}>
            {live ? 'Live' : 'Coming soon'}
          </span>
          <span className="tc-corner">
            {live ? (
              <span className="dot-accent tabular">{left} left</span>
            ) : (
              <>
                <Bell size={16} aria-hidden="true" /> Notify me
              </>
            )}
          </span>
        </div>
        <div className="tc-body">
          <ConceptBadge theme={theme} compact />
          <h2 className="tc-title">{theme.name}</h2>
          <p className="tc-desc">
            {live ? theme.description : `${theme.tagline} ${theme.description}`}
          </p>
          <ul className="chips" aria-label="Drop details">
            {live ? (
              <>
                {theme.price !== null && <li>{sgd(theme.price)}</li>}
                <li>{characters} characters</li>
                <li>{rarityMix(theme.mix)}</li>
                <li>Closes in {closesIn(theme.closes_at, now)}</li>
              </>
            ) : (
              <>
                <li>In development</li>
                <li>Partner drop</li>
              </>
            )}
          </ul>
        </div>
      </Link>
    </li>
  );
}

export function DropsBrowser() {
  const { data } = useLoop();
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'live' || raw === 'soon' ? raw : 'all';
  if (!data) return <Pending />;
  const shown = data.themes.filter(
    (t) => tab === 'all' || (tab === 'live' ? t.status === 'live' : t.status === 'coming_soon'),
  );
  return (
    <section className="wrap drops-page">
      <div className="drops-head">
        <h1>Drops</h1>
        <p className="lead">Limited runs. Made only after you confirm.</p>
      </div>
      <nav className="seg-tabs" aria-label="Filter drops">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === 'all' ? '/drops' : '/drops?tab=' + t.id}
            aria-current={tab === t.id ? 'page' : undefined}
            scroll={false}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <Empty title="Nothing here yet" action={<Button href="/drops">See all drops</Button>}>
          New drops are announced here first.
        </Empty>
      ) : (
        <ul className="theme-grid">
          {shown.map((t) => (
            <ThemeCard key={t.slug} theme={t} now={data.serverTime} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** /drops/[slug]: a live drop page, or "To be continued" for a coming-soon theme. */
export function DropPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useLoop();
  if (!data) return <Pending />;
  const theme = data.themes.find((t) => t.slug === slug || t.campaign_id === slug);
  if (!theme)
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="We couldn’t find that drop."
          action={<Button href="/drops">See all drops</Button>}
        >
          It may have ended, or the link is wrong.
        </Empty>
      </section>
    );
  if (theme.status !== 'live' || !theme.campaign_id) return <ToBeContinued theme={theme} />;
  return <DropDetail theme={theme} campaignId={theme.campaign_id} />;
}

function ToBeContinued({ theme }: { theme: ThemeInfo }) {
  const { data, act, login, busy } = useLoop(),
    router = useRouter(),
    params = useSearchParams(),
    auto = useRef(false);
  const onList = !!data?.interest.includes(theme.slug);
  const signedIn = !!data?.user;
  const notify = async () => {
    if (!signedIn) {
      if (data?.demo) await login('collector');
      else {
        router.push('/login?next=' + encodeURIComponent(`/drops/${theme.slug}?notify=1`));
        return;
      }
    }
    await act({ action: 'notifyTheme', slug: theme.slug });
  };
  useEffect(() => {
    // Back from signing in: finish the request the collector started.
    if (auto.current || params.get('notify') !== '1' || !signedIn || onList) return;
    auto.current = true;
    act({ action: 'notifyTheme', slug: theme.slug });
  }, [params, signedIn, onList, act, theme.slug]);
  return (
    <section className="tbc" style={{ ['--theme-accent' as string]: theme.accent }}>
      <AbstractArt theme={theme} className="tbc-art" />
      <div className="wrap tbc-inner">
        <Link className="back-link" href="/drops">
          <ArrowLeft size={18} aria-hidden="true" /> All drops
        </Link>
        <p className="tbc-theme">{theme.name}</p>
        <ConceptBadge theme={theme} />
        <h1>To be continued…</h1>
        <p className="lead">This drop is still being designed with our partner.</p>
        {onList ? (
          <p className="on-list" role="status">
            <Check size={20} aria-hidden="true" /> You’re on the list. We’ll tell you when it goes
            live.
          </p>
        ) : (
          <Button onClick={notify} disabled={busy}>
            <Bell size={20} aria-hidden="true" /> Notify me
          </Button>
        )}
      </div>
    </section>
  );
}

function CharacterLightbox({
  character,
  theme,
  capacity,
  onClose,
}: {
  character: CharacterInfo | null;
  theme: ThemeInfo;
  capacity: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<'hero' | 'poster'>('hero');
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (character && !d.open) d.showModal();
    if (!character && d.open) d.close();
  }, [character]);
  return (
    <dialog
      ref={ref}
      className="dialog lightbox"
      aria-labelledby="lightbox-title"
      onClose={() => {
        setView('hero');
        onClose();
      }}
    >
      {character && (
        <div className="lb-grid">
          <div className="lb-media">
            {theme.licensed && (
              <div className="lb-views" role="group" aria-label="Image">
                <button aria-pressed={view === 'hero'} onClick={() => setView('hero')}>
                  Figure
                </button>
                <button aria-pressed={view === 'poster'} onClick={() => setView('poster')}>
                  Poster
                </button>
              </div>
            )}
            <CharacterImage character={character} theme={theme} variant={view} eager />
            <ConceptCaption theme={theme} />
          </div>
          <div className="lb-copy">
            <Tier rarity={character.rarity} />
            <h2 id="lightbox-title">{character.name}</h2>
            <p className="lb-odds tabular">
              {odds(character.units, capacity)} odds · {character.units} of {capacity} boxes
            </p>
            {character.description && <p>{character.description}</p>}
            <ConceptBadge theme={theme} />
          </div>
          <button
            className="dialog-close icon-btn"
            aria-label="Close character details"
            onClick={() => ref.current?.close()}
          >
            <X size={22} />
          </button>
        </div>
      )}
    </dialog>
  );
}

function Lineup({
  data,
  theme,
  onOpen,
}: {
  data: Snapshot;
  theme: ThemeInfo;
  onOpen: (c: CharacterInfo) => void;
}) {
  const c = data.campaign;
  const lineup = data.characters.filter((ch) => ch.campaign_id === c.id);
  return (
    <ul className="lineup-v2">
      {lineup.map((ch) => {
        const hidden = ch.rarity === 'SECRET' && !ch.pulled;
        const pct = odds(ch.units, c.capacity);
        return (
          <li
            key={ch.id}
            className={'lu ' + ch.rarity.toLowerCase() + (hidden ? ' is-hidden' : '')}
          >
            <button
              type="button"
              className="lu-media"
              disabled={hidden}
              onClick={() => onOpen(ch)}
              aria-label={hidden ? `Secret character, ${pct} odds` : `${ch.name} details`}
            >
              <CharacterImage character={ch} theme={theme} variant="card" />
              {hidden && (
                <span className="lu-veil" aria-hidden="true">
                  Secret · {pct}
                </span>
              )}
            </button>
            <h3>{hidden ? 'Secret' : ch.name}</h3>
            <div className="lu-meta">
              <Tier rarity={ch.rarity} />
              <span className="odds tabular">{pct}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DropDetail({ theme, campaignId }: { theme: ThemeInfo; campaignId: string }) {
  const data = useCampaign(campaignId),
    { login, busy, act } = useLoop(),
    router = useRouter(),
    [open, setOpen] = useState<CharacterInfo | null>(null);
  if (!data) return <Pending />;
  const query = campaignQuery(campaignId);
  const c = data.campaign,
    remaining = Math.max(0, c.capacity - c.confirmed),
    closed = c.phase !== 'ACTIVE_PREORDER' || data.serverTime >= c.ends_at,
    limit = data.purchases >= c.max_per_user,
    days = Math.max(0, Math.ceil((c.ends_at - data.serverTime) / 86400000)),
    upcoming =
      c.phase === 'UPCOMING' || (c.phase === 'ACTIVE_PREORDER' && data.serverTime < c.starts_at),
    opens = new Date(c.starts_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  const access = data.access[0];
  const enter = async () => {
    if (!data.user || data.user.role !== 'COLLECTOR') {
      if (!data.demo) {
        router.push('/login?next=' + encodeURIComponent('/drops/' + theme.slug));
        return;
      }
      await login('collector');
    }
    router.push(access ? '/open/' + access.id : '/quest' + query);
  };
  return (
    <section className="wrap drop drop-v2" style={{ ['--theme-accent' as string]: theme.accent }}>
      <div className="drop-glow" aria-hidden="true" />
      <div className="drop-main">
        <Link className="back-link" href="/drops">
          <ArrowLeft size={18} aria-hidden="true" /> All drops
        </Link>
        <span className={closed ? 'remaining closed' : 'remaining'}>
          {remaining > 0 ? `${remaining} remaining` : 'Sold out'}
        </span>
        <h1>
          {c.name}
          {!theme.licensed && <span className="tm">™</span>}
        </h1>
        <ConceptBadge theme={theme} />
        <p className="lead">{c.description}</p>
        <h2 className="h3 lineup-title">
          The lineup. One box holds one figure, and you can’t pick which.
        </h2>
        <Lineup data={data} theme={theme} onOpen={setOpen} />
        <p className="note drop-disclosure">
          Every box was shuffled before the drop opened and the fingerprint was published.{' '}
          <Link href={'/verify/' + c.id}>Check the draw yourself</Link>.
          {data.demo &&
            c.id === 'astral' &&
            ' Demo note: the demo uses a fixed shuffle, so the next box is always Eclipse Knight and the walkthrough is repeatable.'}
          {theme.payment_mode === 'demo'
            ? ' This is a concept drop: checkout uses a demo payment and no money is charged.'
            : ' Test-mode payments only: no real money is taken.'}
        </p>
      </div>
      <aside className="panel buy" aria-label="Buy a box">
        <Tier rarity="RARE">
          {upcoming ? 'Opens ' + opens : closed ? 'Preorder closed' : 'Preorder open'}
        </Tier>
        <div className="price tabular">{sgd(c.price)}</div>
        <p>One sealed blind box, made after the preorder closes.</p>
        <dl className="facts">
          <Stat label="Left" value={`${remaining} of ${c.capacity}`} />
          <Stat label="Per person" value={`${c.max_per_user} max`} />
          <Stat label="Slot hold" value={`${theme.slot_hold_minutes} min`} />
          <Stat
            label={upcoming ? 'Opens' : 'Closes'}
            value={upcoming ? opens : closed ? 'Closed' : days === 1 ? '1 day' : `${days} days`}
          />
        </dl>
        <Perforation />
        {remaining <= 0 ? (
          <Button
            wide
            disabled={busy || data.waitlisted}
            onClick={async () => {
              if (!data.user) await login('collector');
              await act({ action: 'waitlist', campaignId: c.id });
            }}
          >
            {data.waitlisted ? 'You’re on the waitlist' : 'Sold out · Join waitlist'}
          </Button>
        ) : (
          <Button wide disabled={busy || closed || limit} onClick={enter}>
            {limit
              ? 'Your collection is complete'
              : upcoming
                ? 'Opens ' + opens
                : closed
                  ? 'Preorders closed'
                  : access
                    ? 'Claim preorder slot'
                    : 'Play to unlock'}
          </Button>
        )}
        <p className="odds-note">
          Free to play. No purchase needed to try the game. Odds are shown on every character.
          {data.purchases > 0 && ` You have used ${data.purchases} of ${c.max_per_user} slots.`}
        </p>
      </aside>
      <CharacterLightbox
        character={open}
        theme={theme}
        capacity={c.capacity}
        onClose={() => setOpen(null)}
      />
    </section>
  );
}
