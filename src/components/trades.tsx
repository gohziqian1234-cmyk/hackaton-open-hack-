'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Repeat2, Check, ShieldCheck } from 'lucide-react';
import { useLoop } from './provider';
import { CollectorGate } from './collection';
import { Loading } from './shell';
import { KinArt } from './art';
import { characters, phases } from '../lib/catalog';
import type { Match } from '../lib/types';
export function Trades() {
  const { data, act, busy } = useLoop(),
    params = useSearchParams(),
    [selection, setSelection] = useState(''),
    [wants, setWants] = useState<string[]>([]),
    [searched, setSearched] = useState(false);
  if (!data) return <Loading />;
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
    <section className="page trade-page">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">A BETTER MATCH IS OUT THERE</p>
          <h1>
            The trade room<span>.</span>
          </h1>
          <p>Same rarity. A new connection. Nothing shipped twice.</p>
        </div>
        <span className="status-tag">
          <span className="live-dot" />
          {closed ? 'TRADING CLOSED' : 'TRADE WINDOW OPEN'}
        </span>
      </div>
      <div className="trade-principle">
        <ShieldCheck size={20} />
        <p>
          A fair exchange, by design. Trades are reciprocal and stay within the same rarity tier.
          Both collectors agree before ownership changes.
        </p>
      </div>
      {closed ? (
        <div className="empty">
          <h2>The constellation is set.</h2>
          <p>Allocations are final. Your kin are ready for the next chapter.</p>
          <Link className="button primary" href="/collection">
            View my collection
          </Link>
        </div>
      ) : (
        <>
          {pending.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
          {available.length > 0 ? (
            <div className="trade-builder">
              <div className="trade-offer">
                <p className="eyebrow">01 / WHAT YOU HAVE</p>
                <label className="field-label" htmlFor="offered-kin">
                  Choose your collectible
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
                  {available.map((a) => (
                    <option key={a.id} value={a.id}>
                      {characters.find((c) => c.id === a.character_id)?.name} · {a.id.slice(0, 6)}
                    </option>
                  ))}
                </select>
                {selected && (
                  <>
                    <KinArt id={selected.character_id} />
                    <span className={'rarity ' + ch?.rarity.toLowerCase()}>{ch?.rarity}</span>
                    <h2>{ch?.name}</h2>
                    <p>Yours to exchange. Never lost while searching.</p>
                  </>
                )}
              </div>
              <div className="trade-wants">
                <p className="eyebrow">02 / WHO YOU’D LOVE TO MEET</p>
                <h2>
                  A different kind
                  <br />
                  of connection.
                </h2>
                <p>Choose any same-tier kin you’d happily welcome.</p>
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
                        <small>{c.rarity}</small>
                        <strong>{c.name}</strong>
                      </span>
                      <span className="choice-check">
                        {wants.includes(c.id) && <Check size={15} />}
                      </span>
                    </label>
                  ))}
                </div>
                {alternatives.length === 0 && (
                  <p className="empty-tier">
                    There’s only one secret character in this series. Keep this one of a kind
                    connection.
                  </p>
                )}
                <button
                  className="button primary wide"
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
                  {busy ? 'Looking for your connection…' : 'Find my match'} <Repeat2 size={18} />
                </button>
                {(searched || selected?.status === 'TRADE_LISTED') && (
                  <div className="search-state" role="status">
                    <span className="live-dot" />
                    <div>
                      <strong>Your wish is in the constellation.</strong>
                      <p>
                        No reciprocal match yet. Your kin stays yours. Check back or update your
                        choices.
                      </p>
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => {
                          act({ action: 'keep', allocationId: selected!.id });
                          setSearched(false);
                        }}
                      >
                        Cancel listing and keep my kin
                      </button>
                    </div>
                  </div>
                )}
                <p className="fine">
                  Trades close{' '}
                  {new Date(data.campaign.trade_ends_at).toLocaleDateString('en-SG', {
                    day: 'numeric',
                    month: 'long',
                  })}
                  . Matching doesn’t change rarity or create more units.
                </p>
              </div>
            </div>
          ) : (
            pending.length === 0 && (
              <div className="empty">
                <h2>A new connection starts with a kin.</h2>
                <Link className="button primary" href="/collection">
                  Visit my collection <ArrowUpRight size={17} />
                </Link>
              </div>
            )
          )}
        </>
      )}
      {done.length > 0 && (
        <section className="trade-history">
          <p className="eyebrow">CONNECTIONS MADE</p>
          {done.map((m) => (
            <div key={m.id}>
              <Check size={19} />
              <p>
                <strong>Exchange complete.</strong> A new home for two digital kin.
              </p>
              <Link href="/collection">
                See my updated collection <ArrowRight size={16} />
              </Link>
            </div>
          ))}
        </section>
      )}
      <p className="fine trade-demo-note">
        Demo partner: Sarah’s seeded listing automatically consents to a reciprocal exchange. Other
        collectors require both explicit acceptances.
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
  return (
    <div className="match-card">
      <div className="match-heading">
        <p className="eyebrow">
          <span className="live-dot" /> A CONNECTION, FOUND
        </p>
        <h2>Two kin. Two happy collectors.</h2>
        <p>Your match with {m.partner} is ready.</p>
      </div>
      <div className="match-exchange">
        <div>
          <span>YOU OFFER</span>
          <KinArt id={offered?.id} />
          <h3>{offered?.name}</h3>
          <small>{offered?.rarity}</small>
        </div>
        <div className="exchange-symbol">
          <Repeat2 size={32} />
          <span>
            SAME RARITY
            <br />
            NEW CONNECTION
          </span>
        </div>
        <div>
          <span>YOU RECEIVE</span>
          <KinArt id={requested?.id} />
          <h3>{requested?.name}</h3>
          <small>{requested?.rarity}</small>
        </div>
      </div>
      <div className="button-row">
        <button
          className="button primary"
          disabled={busy || !!accepted}
          onClick={() => act({ action: 'respond', matchId: m.id, accept: true })}
        >
          {accepted ? 'Waiting for the other collector' : 'Accept exchange'} <Check size={18} />
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => act({ action: 'respond', matchId: m.id, accept: false })}
        >
          Decline match
        </button>
      </div>
      <p className="fine">Both allocations are reserved while this match is pending.</p>
    </div>
  );
}
