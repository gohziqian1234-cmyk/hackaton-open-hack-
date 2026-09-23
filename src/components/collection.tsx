'use client';
import { Download, LockKeyhole, Package } from 'lucide-react';
import { kinOf, useLoop } from './provider';
import { KinArt, BoxArt } from './art';
import { phaseIndex } from '../lib/catalog';
import { Pending } from './shell';
import { downloadCard } from './purchase';
import { Button, Empty, Tier } from './ui';
export function CollectorGate() {
  const { login, busy } = useLoop();
  return (
    <section className="wrap page-pad">
      <Empty
        heading="h1"
        title="Sign in to see your boxes."
        icon={<Package size={26} />}
        action={
          <Button disabled={busy} onClick={() => login('collector')}>
            Enter demo collection
          </Button>
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
export function Collection() {
  const { data } = useLoop();
  if (!data) return <Pending />;
  if (data.user?.role !== 'COLLECTOR') return <CollectorGate />;
  const lockedFor = (campaignId: string) =>
    phaseIndex(data.campaigns.find((c) => c.id === campaignId)?.phase ?? 'ACTIVE_PREORDER') >= 4;
  const locked = data.collection.length > 0 && data.collection.every((a) => lockedFor(a.campaign_id));
  return (
    <section className="wrap collection">
      <div className="page-heading">
        <div>
          <h1>My collection</h1>
          <p className="lead">
            {data.collection.length === 1
              ? 'You own 1 box.'
              : `You own ${data.collection.length} boxes.`}{' '}
            {locked
              ? 'Allocations are final.'
              : 'Nothing is made until allocations lock, so you can still trade.'}
          </p>
        </div>
      </div>
      {data.collection.length === 0 ? (
        <Empty
          title="No boxes yet"
          icon={<Package size={26} />}
          action={<Button href="/drop">Go to the drop</Button>}
        >
          Win the free game on the drop page to unlock a slot, then open your first box here.
        </Empty>
      ) : (
        <ul className="collection-grid">
          {data.collection.map((a) => {
            const ch = kinOf(data, a.character_id),
              final = lockedFor(a.campaign_id);
            const duplicate =
              !!a.revealed &&
              data.collection.filter((other) => other.character_id === a.character_id).length > 1;
            return (
              <li key={a.id} className="card collection-card">
                <div className="collection-art">
                  {duplicate && <span className="dup-badge">Duplicate</span>}
                  {a.revealed && ch ? (
                    <KinArt id={ch.id} name={ch.name} color={ch.color} />
                  ) : (
                    <BoxArt />
                  )}
                </div>
                <div className="collection-body">
                  {ch ? <Tier rarity={ch.rarity} /> : <span className="tier unopened">Sealed</span>}
                  <h2 className="h3">{ch?.name || 'Sealed box'}</h2>
                  <p className="status-line">
                    {final && <LockKeyhole size={16} aria-hidden="true" />}
                    {a.revealed
                      ? statusText[a.status] || 'Yours.'
                      : 'Your kin is already chosen. Open it when you are ready.'}
                  </p>
                  <div className="row">
                    {!a.revealed ? (
                      <Button href={'/reveal/' + a.id}>Open my box</Button>
                    ) : final ? (
                      <Button href="/drop" variant="ghost">
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
                        onClick={() => downloadCard(ch.name, ch.rarity)}
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
    </section>
  );
}
