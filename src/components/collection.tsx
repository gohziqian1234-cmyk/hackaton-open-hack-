'use client';
import Link from 'next/link';
import { ArrowUpRight, Download, LockKeyhole, Repeat2, Package, Check } from 'lucide-react';
import { useLoop } from './provider';
import { KinArt, BoxArt } from './art';
import { characters, phases } from '../lib/catalog';
import { Loading } from './shell';
import { downloadCard } from './purchase';
export function CollectorGate() {
  const { login, busy } = useLoop();
  return (
    <section className="page empty">
      <p className="eyebrow">YOUR NEXT CHAPTER</p>
      <h1>
        A constellation
        <br />
        of your own.
      </h1>
      <p>Enter as Alex, our demo collector. Your progress stays saved.</p>
      <button className="button primary" disabled={busy} onClick={() => login('collector')}>
        Enter demo collection <ArrowUpRight size={18} />
      </button>
    </section>
  );
}
export function Collection() {
  const { data } = useLoop();
  if (!data) return <Loading />;
  if (data.user?.role !== 'COLLECTOR') return <CollectorGate />;
  const locked = phases.indexOf(data.campaign.phase) >= 4;
  return (
    <section className="page collection-page">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">THE THINGS THAT FIND YOU</p>
          <h1>
            My constellation<span>.</span>
          </h1>
          <p>Your digital collection. Soon, something you can hold.</p>
        </div>
        <Link className="button secondary" href="/drop">
          Explore the drop <ArrowUpRight size={18} />
        </Link>
      </div>
      <div className="collection-meta">
        <span>{String(data.collection.length).padStart(2, '0')} KIN COLLECTED</span>
        <span>ASTRAL KIN / SERIES 01</span>
        <span>
          <span className="live-dot" />
          {locked ? 'ALLOCATIONS FINAL' : 'PRE-PRODUCTION'}
        </span>
      </div>
      {data.collection.length === 0 ? (
        <div className="empty">
          <Package size={40} />
          <h2>Your first kin is waiting.</h2>
          <Link className="button primary" href="/quest">
            Play to unlock
          </Link>
        </div>
      ) : (
        <div className="collection-grid">
          {data.collection.map((a, i) => {
            const ch = characters.find((c) => c.id === a.character_id);
            const duplicate =
              a.revealed &&
              data.collection.filter((other) => other.character_id === a.character_id).length > 1;
            return (
              <article key={a.id} className="collection-card">
                <div className="collection-art">
                  <span className="card-number">KIN / {String(i + 1).padStart(3, '0')}</span>
                  {duplicate && <span className="duplicate-label">DUPLICATE</span>}
                  {a.revealed ? <KinArt id={a.character_id} /> : <BoxArt />}
                  <span className="art-edition">THE FIRST CONSTELLATION</span>
                </div>
                <div className="collection-card-body">
                  <span className={'rarity ' + ch?.rarity.toLowerCase()}>
                    {ch?.rarity || 'UNOPENED'}
                  </span>
                  <h2>{ch?.name || 'A mystery, waiting.'}</h2>
                  <p>
                    {a.revealed
                      ? ch?.description
                      : 'Your kin has been allocated. Meet them whenever you’re ready.'}
                  </p>
                  <div className="allocation-status">
                    {locked ? (
                      <LockKeyhole size={13} />
                    ) : a.status === 'OWNED' ? (
                      <Check size={13} />
                    ) : (
                      <Repeat2 size={13} />
                    )}{' '}
                    {a.status.replaceAll('_', ' ').toLowerCase()} ·{' '}
                    {locked ? 'Final demand' : 'Not manufactured yet'}
                  </div>
                  <div className="card-actions">
                    {!a.revealed ? (
                      <Link className="button primary" href={'/reveal/' + a.id}>
                        Open my box <ArrowUpRight size={16} />
                      </Link>
                    ) : (
                      <>
                        <Link
                          className="button secondary"
                          href={locked ? '/drop' : '/trades?allocation=' + a.id}
                        >
                          {locked
                            ? 'View campaign'
                            : a.status === 'OWNED'
                              ? 'Find a trade'
                              : 'View trade'}{' '}
                          <ArrowUpRight size={16} />
                        </Link>
                        <button
                          className="icon-button"
                          aria-label={'Download ' + ch?.name + ' card'}
                          onClick={() => downloadCard(ch?.name || '', ch?.rarity || '')}
                        >
                          <Download size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="collection-footnote">
        <Package size={25} />
        <div>
          <h3>Digital first. Physical next.</h3>
          <p>
            We manufacture the final confirmed allocations after trading closes. Your order follows
            the kin you own when allocations lock.
          </p>
        </div>
      </div>
    </section>
  );
}
