'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Check, Repeat2, ShieldCheck } from 'lucide-react';
import { useLoop } from './provider';
import { CollectorGate } from './collection';
import { Pending } from './shell';
import { KinArt } from './art';
import { characters, phases } from '../lib/catalog';
import type { Match } from '../lib/types';
import { Button, Empty, Tier } from './ui';
export function Trades() {
  const { data, act, busy } = useLoop(),
    params = useSearchParams(),
    [selection, setSelection] = useState(''),
    [wants, setWants] = useState<string[]>([]),
    [searched, setSearched] = useState(false);
  if (!data) return <Pending />;
  if (data.user?.role !== 'COLLECTOR') return <CollectorGate />;
  const available = data.collection.filter(
    (a) => a.revealed && ['OWNED', 'TRADE_LISTED'].includes(a.status),
  );
  const selected =
    available.find((a) => a.id === (selection || params.get('allocation'))) || available[0];
  const ch = characters.find((c) => c.id === selected?.character_id),
    alternatives = characters.filter((c) => c.rarity === ch?.rarity && c.id !== ch?.id);
  const pending = data.matches.filter((m) => m.status === 'PENDING'),
    done = data.matches.filter((m) => m.status === 'ACCEPTED');
  const closed =
    phases.indexOf(data.campaign.phase) >= 4 || data.serverTime >= data.campaign.trade_ends_at;
  return (
    <section className="wrap trades">
      <div className="page-heading">
        <div>
          <h1>Trade room</h1>
          <p className="lead">
            Swap a kin for another one of the same rarity. Both collectors must agree before
            anything changes.
          </p>
        </div>
        <span className={closed ? 'live closed' : 'live'}>
          {closed ? 'Trading closed' : 'Trading open'}
        </span>
      </div>
      {done.length > 0 && (
        <section className="trade-history" aria-label="Completed trades">
          {done.map((m) => (
            <div key={m.id} className="card success-card">
              <Check size={24} aria-hidden="true" />
              <p>
                <strong>Exchange complete.</strong> You now own{' '}
                {characters.find((c) => c.id === (data.user?.id === m.a_user ? m.requested : m.offered))?.name}.
              </p>
              <Link className="btn btn-ghost" href="/collection">
                See my updated collection
              </Link>
            </div>
          ))}
        </section>
      )}
      {closed ? (
        <Empty
          title="Trading has closed."
          action={<Button href="/collection">View my collection</Button>}
        >
          Allocations are final. Your kin are going to production.
        </Empty>
      ) : (
        <>
          {pending.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
          {available.length > 0 ? (
            <div className="trade-builder">
              <div className="card trade-offer">
                <h2 className="h3">1. What you give</h2>
                <label className="field-label" htmlFor="offered-kin">
                  Choose a kin from your collection
                </label>
                <select
                  id="offered-kin"
                  value={selected?.id}
                  onChange={(e) => {
                    setSelection(e.target.value);
                    setWants([]);
                    setSearched(false);
                  }}
                >
                  {available.map((a, i) => (
                    <option key={a.id} value={a.id}>
                      {characters.find((c) => c.id === a.character_id)?.name}, box {i + 1}
                    </option>
                  ))}
                </select>
                {selected && ch && (
                  <div className="offer-preview">
                    <KinArt id={selected.character_id} />
                    <Tier rarity={ch.rarity} />
                    <p className="offer-name">{ch.name}</p>
                  </div>
                )}
              </div>
              <div className="card trade-wants">
                <h2 className="h3">2. What you would take</h2>
                <p>Tick every {ch?.rarity.toLowerCase()} kin you would happily accept.</p>
                <div className="want-options">
                  {alternatives.map((c) => (
                    <label
                      className={wants.includes(c.id) ? 'want-option checked' : 'want-option'}
                      key={c.id}
                    >
                      <input
                        type="checkbox"
                        checked={wants.includes(c.id)}
                        onChange={(e) =>
                          setWants(
                            e.target.checked ? [...wants, c.id] : wants.filter((id) => id !== c.id),
                          )
                        }
                      />
                      <KinArt id={c.id} />
                      <span>
                        <strong>{c.name}</strong>
                        <Tier rarity={c.rarity} />
                      </span>
                    </label>
                  ))}
                </div>
                {alternatives.length === 0 && (
                  <p className="note">
                    There is only one secret character in this series, so it has no trade partner.
                  </p>
                )}
                <Button
                  wide
                  disabled={busy || !selected || !wants.length}
                  onClick={async () => {
                    const r = await act<{ matched: boolean }>({
                      action: 'trade',
                      allocationId: selected!.id,
                      wants,
                    });
                    if (r) {
                      setSearched(!r.matched);
                      setWants([]);
                    }
                  }}
                >
                  {busy ? 'Looking for a match…' : 'Find my match'}
                </Button>
                {(searched || selected?.status === 'TRADE_LISTED') && (
                  <div className="search-state" role="status">
                    <strong>No match yet.</strong>
                    <p>
                      Your kin is listed and still yours. We match you as soon as someone wants it
                      back.
                    </p>
                    <Button
                      variant="quiet"
                      disabled={busy}
                      onClick={() => {
                        act({ action: 'keep', allocationId: selected!.id });
                        setSearched(false);
                      }}
                    >
                      Stop looking and keep my kin
                    </Button>
                  </div>
                )}
                <p className="note">
                  Trading closes{' '}
                  {new Date(data.campaign.trade_ends_at).toLocaleDateString('en-SG', {
                    day: 'numeric',
                    month: 'long',
                  })}
                  . Swaps never change rarity or add boxes.
                </p>
              </div>
            </div>
          ) : (
            pending.length === 0 && (
              <Empty
                title="Nothing to trade yet."
                action={<Button href="/collection">Open my collection</Button>}
              >
                Open a box first. Then you can offer it here.
              </Empty>
            )
          )}
        </>
      )}
      <p className="note trade-principle">
        <ShieldCheck size={18} aria-hidden="true" /> Demo note: Sarah is a seeded collector who
        agrees to her swap automatically. Real collectors both have to accept.
      </p>
    </section>
  );
}
function MatchCard({ match: m }: { match: Match }) {
  const { data, act, busy } = useLoop();
  const isA = data?.user?.id === m.a_user,
    offered = characters.find((c) => c.id === (isA ? m.offered : m.requested)),
    requested = characters.find((c) => c.id === (isA ? m.requested : m.offered));
  const accepted = isA ? m.a_accept : m.b_accept;
  const partner = m.partner.replace(' (demo)', '');
  return (
    <section className="match" aria-labelledby={'match-' + m.id}>
      <h2 id={'match-' + m.id}>Two kin. Two happy collectors.</h2>
      <p className="match-sub">You matched with {m.partner}. Both boxes are held until you decide.</p>
      <div className="match-cards">
        <div className="card mcard">
          <span className="mcard-label">You give</span>
          <KinArt id={offered?.id} />
          <h3>{offered?.name}</h3>
          {offered && <Tier rarity={offered.rarity} />}
        </div>
        <div className="swap" aria-hidden="true">
          <Repeat2 size={32} strokeWidth={2.6} />
        </div>
        <div className="card mcard">
          <span className="mcard-label">{partner} gives</span>
          <KinArt id={requested?.id} />
          <h3>{requested?.name}</h3>
          {requested && <Tier rarity={requested.rarity} />}
        </div>
      </div>
      <div className="match-foot">
        <Button
          disabled={busy || !!accepted}
          onClick={() => act({ action: 'respond', matchId: m.id, accept: true })}
        >
          {accepted ? 'Waiting for the other collector' : 'Accept exchange'}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => act({ action: 'respond', matchId: m.id, accept: false })}
        >
          Decline
        </Button>
      </div>
    </section>
  );
}
