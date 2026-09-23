'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Download, LockKeyhole, Package, ScanLine } from 'lucide-react';
import { useLoop } from './provider';
import { BoxArt } from './art';
import { phaseIndex } from '../lib/catalog';
import { Pending } from './shell';
import { downloadCard } from './purchase';
import { Button, Empty, Tier } from './ui';
import { CharacterImage, ConceptBadge } from './character-image';
import { charOf } from './checkout';
import { OpeningSequence } from './opening';
import { ScannerSheet, type Claimed } from './scanner';
import { themeFor } from '../lib/links';
import { serialLabel } from '../lib/format';

export function CollectorGate({ next = '/collection' }: { next?: string }) {
  const { data, login, busy } = useLoop();
  return (
    <section className="wrap page-pad">
      <Empty
        heading="h1"
        title="Sign in to see your boxes."
        icon={<Package size={26} />}
        action={
          data?.demo === false ? (
            <Button href={'/login?next=' + encodeURIComponent(next)}>Sign in</Button>
          ) : (
            <Button disabled={busy} onClick={() => login('collector')}>
              Enter demo collection
            </Button>
          )
        }
      >
        This demo signs you in as Alex, a collector with one box already. Your progress is saved.
      </Empty>
    </section>
  );
}
const statusText: Record<string, string> = {
  OWNED: 'Yours. Not made yet.',
  TRADE_LISTED: 'Looking for a trade.',
  TRADE_PENDING: 'Trade match waiting for both collectors.',
  LOCKED_FOR_PRODUCTION: 'Final. Going to production.',
};
const TABS = [
  { id: 'all', label: 'All' },
  { id: 'digital', label: 'Digital pulls' },
  { id: 'physical', label: 'Physical' },
] as const;

export function Collection() {
  const { data } = useLoop();
  const params = useSearchParams(),
    router = useRouter();
  const raw = params.get('tab');
  const tab = raw === 'digital' || raw === 'physical' ? raw : 'all';
  const [scanning, setScanning] = useState(false);
  const [claimed, setClaimed] = useState<Claimed | null>(null);
  const autoOpened = useRef(false);
  useEffect(() => {
    // Back from signing in with "Add more": open the scanner straight away.
    if (autoOpened.current || params.get('add') !== '1' || data?.user?.role !== 'COLLECTOR') return;
    autoOpened.current = true;
    const frame = requestAnimationFrame(() => setScanning(true));
    return () => cancelAnimationFrame(frame);
  }, [params, data?.user?.role]);
  if (!data) return <Pending />;
  if (data.user?.role !== 'COLLECTOR') return <CollectorGate next="/collection?add=1" />;
  const lockedFor = (campaignId: string) =>
    phaseIndex(data.campaigns.find((c) => c.id === campaignId)?.phase ?? 'ACTIVE_PREORDER') >= 4;
  const locked =
    data.collection.length > 0 && data.collection.every((a) => lockedFor(a.campaign_id));
  const showDigital = tab !== 'physical',
    showPhysical = tab !== 'digital';
  const count = data.collection.length + data.physical.length;
  if (claimed) {
    const theme = themeFor(data.themes, claimed.character.campaign_id);
    return (
      <section className="reveal-page">
        <OpeningSequence
          theme={theme}
          character={claimed.character}
          capacity={claimed.figure.cap}
          startAt="reveal"
          keepLabel="Show my collection"
          onKeep={() => {
            setClaimed(null);
            router.replace('/collection?tab=physical', { scroll: false });
          }}
        >
          <p className="verified-line">
            <BadgeCheck size={20} aria-hidden="true" /> Verified physical ·{' '}
            <span className="tabular">
              {serialLabel(claimed.figure.serial_no, claimed.figure.cap)}
            </span>
          </p>
        </OpeningSequence>
      </section>
    );
  }
  return (
    <section className="wrap collection">
      <div className="page-heading col-heading">
        <div>
          <h1>My collection</h1>
          <p className="lead">
            {count === 1 ? 'You have 1 figure.' : `You have ${count} figures.`}{' '}
            {locked
              ? 'Allocations are final.'
              : 'Nothing is made until allocations lock, so you can still trade.'}
          </p>
        </div>
        <Button onClick={() => setScanning(true)}>
          <ScanLine size={20} aria-hidden="true" /> Add more
        </Button>
      </div>
      <nav className="seg-tabs" aria-label="Filter collection">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === 'all' ? '/collection' : '/collection?tab=' + t.id}
            aria-current={tab === t.id ? 'page' : undefined}
            scroll={false}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {(showDigital ? data.collection.length : 0) + (showPhysical ? data.physical.length : 0) ===
      0 ? (
        tab === 'physical' ? (
          <Empty
            title="No physical figures yet"
            icon={<ScanLine size={26} />}
            action={<Button onClick={() => setScanning(true)}>Add more</Button>}
          >
            Own a LoopBox figure? Scan the QR code on its base or box to show it off here.
          </Empty>
        ) : (
          <Empty
            title="No boxes yet"
            icon={<Package size={26} />}
            action={<Button href="/drops">Go to the drops</Button>}
          >
            Win the free game on a drop page to unlock a slot, then open your first box.
          </Empty>
        )
      ) : (
        <ul className="collection-grid">
          {showPhysical &&
            data.physical.map((p) => {
              const ch = charOf(data, p.character_id);
              const theme = themeFor(data.themes, p.campaign_id);
              if (!ch) return null;
              return (
                <li key={p.id} className="card collection-card physical">
                  <div className="collection-art">
                    <span className="phys-badge">
                      <BadgeCheck size={16} aria-hidden="true" /> Verified physical
                    </span>
                    <CharacterImage character={ch} theme={theme} variant="card" />
                  </div>
                  <div className="collection-body">
                    <Tier rarity={ch.rarity} />
                    <h2 className="h3">{ch.name}</h2>
                    <p className="status-line">
                      {theme?.name} ·{' '}
                      <span className="tabular">{serialLabel(p.serial_no, p.cap)}</span>
                    </p>
                    <ConceptBadge theme={theme} compact />
                  </div>
                </li>
              );
            })}
          {showDigital &&
            data.collection.map((a) => {
              const ch = a.character_id ? charOf(data, a.character_id) : undefined,
                theme = themeFor(data.themes, a.campaign_id),
                final = lockedFor(a.campaign_id);
              const duplicate =
                !!a.revealed &&
                data.collection.filter((other) => other.character_id === a.character_id).length > 1;
              return (
                <li key={a.id} className="card collection-card">
                  <div className="collection-art">
                    {duplicate && <span className="dup-badge">Duplicate</span>}
                    {a.revealed && ch ? (
                      <CharacterImage character={ch} theme={theme} variant="card" />
                    ) : (
                      <BoxArt />
                    )}
                  </div>
                  <div className="collection-body">
                    {ch ? (
                      <Tier rarity={ch.rarity} />
                    ) : (
                      <span className="tier unopened">Sealed</span>
                    )}
                    <h2 className="h3">{ch?.name || 'Sealed box'}</h2>
                    <p className="status-line">
                      {final && <LockKeyhole size={16} aria-hidden="true" />}
                      {a.revealed
                        ? statusText[a.status] || 'Yours.'
                        : 'Your figure is already chosen. Open it when you are ready.'}
                    </p>
                    <ConceptBadge theme={theme} compact />
                    <div className="row">
                      {!a.revealed ? (
                        <Button href={'/reveal/' + a.id}>Open my box</Button>
                      ) : final ? (
                        <Button href={theme ? '/drops/' + theme.slug : '/drops'} variant="ghost">
                          View the drop
                        </Button>
                      ) : (
                        <Button href={'/trades?allocation=' + a.id} variant="ghost">
                          {a.status === 'OWNED' ? 'Find a trade' : 'View trade'}
                        </Button>
                      )}
                      {!!a.revealed && ch && (
                        <button
                          className="icon-btn"
                          aria-label={'Download ' + ch.name + ' card'}
                          onClick={() => downloadCard(ch, theme)}
                        >
                          <Download size={20} />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
      <ScannerSheet
        open={scanning}
        onClose={() => setScanning(false)}
        onClaimed={(c) => {
          setScanning(false);
          setClaimed(c);
        }}
      />
    </section>
  );
}
