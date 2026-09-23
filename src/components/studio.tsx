'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  Settings2,
  X,
  LockKeyhole,
  Check,
  RefreshCw,
} from 'lucide-react';
import { useLoop } from './provider';
import { Loading } from './shell';
import { characters, phases, money } from '../lib/catalog';
import type { Analytics, Campaign } from '../lib/types';
export function Studio() {
  const { data, login, act, busy } = useLoop(),
    [analytics, setAnalytics] = useState<Analytics | null>(null),
    [fetchError, setFetchError] = useState(''),
    [version, setVersion] = useState(0);
  const edit = useRef<HTMLDialogElement>(null),
    advance = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (data?.user?.role !== 'BUSINESS') return;
    fetch('/api/loopbox?analytics=1', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Studio data is unavailable. Please retry.');
        return r.json();
      })
      .then(setAnalytics)
      .catch((e) => setFetchError(e.message));
  }, [data, version]);
  if (!data) return <Loading />;
  if (data.user?.role !== 'BUSINESS')
    return (
      <section className="page empty">
        <p className="eyebrow">BEHIND THE CONSTELLATION</p>
        <h1>The maker’s studio.</h1>
        <p>See the demand. Make what matters.</p>
        <button className="button primary" disabled={busy} onClick={() => login('business')}>
          Enter demo studio <ArrowUpRight size={18} />
        </button>
      </section>
    );
  if (!analytics)
    return fetchError ? (
      <section className="page empty">
        <p role="alert">{fetchError}</p>
        <button className="button primary" onClick={() => setVersion((v) => v + 1)}>
          Retry studio data
        </button>
      </section>
    ) : (
      <Loading />
    );
  const c = data.campaign,
    index = phases.indexOf(c.phase),
    locked = index >= 4,
    next = phases[index + 1];
  return (
    <section className="page studio-page">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">ASTRAL STUDIO / MAKER WORKSPACE</p>
          <h1>
            Demand, before making<span>.</span>
          </h1>
          <p>A clearer picture of what belongs in the world.</p>
        </div>
        <div className="button-row">
          <button
            className="icon-button"
            aria-label="Refresh analytics"
            onClick={() => setVersion((v) => v + 1)}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="button secondary"
            disabled={index > 1}
            onClick={() => edit.current?.showModal()}
          >
            <Settings2 size={16} /> Edit campaign
          </button>
        </div>
      </div>
      <div className="studio-campaign">
        <div>
          <span className="eyebrow">SERIES 01 · {money(c.price)} SGD / BOX</span>
          <h2>{c.name}</h2>
        </div>
        <div className="studio-status">
          <span className="status-tag">
            <span className="live-dot" />
            {c.phase.replaceAll('_', ' ')}
          </span>
          {next && (
            <button className="text-link" onClick={() => advance.current?.showModal()}>
              Advance campaign <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="studio-metrics">
        {[
          { n: analytics.orders, label: 'Confirmed orders', note: `of ${c.capacity} maximum` },
          {
            n: c.capacity - analytics.orders,
            label: 'Unmanufactured capacity',
            note: 'Not a claim of measured savings',
          },
          {
            n: analytics.players,
            label: 'Quest players',
            note: `${analytics.completions} attempts finished`,
          },
          {
            n: analytics.trades,
            label: 'Exchanges completed',
            note: `${analytics.trades * 2} digital allocations rehomed`,
          },
        ].map((m) => (
          <div key={m.label}>
            <span>{m.label}</span>
            <strong>{String(m.n).padStart(2, '0')}</strong>
            <small>{m.note}</small>
          </div>
        ))}
      </div>
      <div className="studio-grid">
        <section className="production-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                {locked ? 'FINAL MANUFACTURING PLAN' : 'LIVE ALLOCATION PLAN'}
              </p>
              <h2>{locked ? 'Ready to make.' : 'A constellation taking shape.'}</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Download production CSV"
              onClick={() => exportPlan(analytics, c, locked)}
            >
              <Download size={17} />
            </button>
          </div>
          <div className="production-table-wrap">
            <table className="production-table">
              <thead>
                <tr>
                  <th>Collectible</th>
                  <th>Tier</th>
                  <th>Confirmed demand</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                {analytics.distribution.map((row) => (
                  <tr key={row.id}>
                    <th>
                      <span
                        className="table-dot"
                        style={{ background: characters.find((ch) => ch.id === row.id)?.color }}
                      />
                      {row.name}
                    </th>
                    <td>
                      <span className={'rarity ' + row.rarity.toLowerCase()}>{row.rarity}</span>
                    </td>
                    <td>
                      <div className="demand-bar">
                        <span
                          style={{
                            width:
                              (row.quantity /
                                Math.max(...analytics.distribution.map((d) => d.quantity))) *
                                100 +
                              '%',
                            background: characters.find((ch) => ch.id === row.id)?.color,
                          }}
                        />
                      </div>
                    </td>
                    <td>{row.quantity}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>Total {locked ? 'to manufacture' : 'confirmed allocations'}</th>
                  <td>{analytics.orders}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="fine">
            {locked
              ? 'Allocations are locked. This is the final in-house manufacturing requirement.'
              : 'Trading can still change who owns each kin. Quantities reflect paid allocations, never speculative stock.'}
          </p>
        </section>
        <aside className="studio-side">
          <section>
            <p className="eyebrow">THE JOURNEY SO FAR</p>
            <h3>Every step, accounted for.</h3>
            <dl className="studio-funnel">
              <div>
                <dt>Quest players</dt>
                <dd>{analytics.players}</dd>
              </div>
              <div>
                <dt>Preorder access earned</dt>
                <dd>{analytics.unlocks}</dd>
              </div>
              <div>
                <dt>Confirmed orders</dt>
                <dd>{analytics.orders}</dd>
              </div>
              <div>
                <dt>Digital boxes opened</dt>
                <dd>{analytics.opened}</dd>
              </div>
              <div>
                <dt>Active trade listings</dt>
                <dd>{analytics.listings}</dd>
              </div>
            </dl>
            <p className="fine">
              93 orders are seeded demo history. Quest engagement tracks sessions played in this
              demo.
            </p>
          </section>
          <section className="making-note">
            <LockKeyhole size={22} />
            <h3>{locked ? 'Made to final demand.' : 'Nothing made too soon.'}</h3>
            <p>
              Preorders close. Trades settle. Allocations lock. Only then do we manufacture
              in-house.
            </p>
            <span>
              {locked ? (
                <>
                  <Check size={14} /> Allocations locked
                </>
              ) : (
                'No carbon-savings estimates. No invented impact.'
              )}
            </span>
          </section>
        </aside>
      </div>
      <div className="phase-timeline">
        {phases.slice(1).map((p, i) => (
          <div key={p} className={i + 1 <= index ? 'passed' : ''}>
            <span>{i + 1 < index ? <Check size={12} /> : String(i + 1).padStart(2, '0')}</span>
            <p>{p.replaceAll('_', ' ').toLowerCase()}</p>
          </div>
        ))}
      </div>
      <dialog ref={advance} className="dialog">
        <button
          className="dialog-close icon-button"
          aria-label="Close phase dialog"
          onClick={() => advance.current?.close()}
        >
          <X size={18} />
        </button>
        <p className="eyebrow">CAMPAIGN TRANSITION</p>
        <h2>{next?.replaceAll('_', ' ').toLowerCase()}</h2>
        <p>
          {next === 'ALLOCATION_LOCKED'
            ? 'This will freeze all current ownership, expire pending matches, and close trading. These allocations become the final manufacturing plan.'
            : next === 'PREORDER_CLOSED'
              ? 'This closes new preorders. Existing allocations can still be exchanged before the trade window ends.'
              : 'Move the campaign to its next stage. Phase changes apply to every collector in this demo.'}
        </p>
        <div className="button-row">
          <button className="button secondary" onClick={() => advance.current?.close()}>
            Keep current phase
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              const r = await act({ action: 'advance' });
              if (r) advance.current?.close();
            }}
          >
            Confirm phase change <ArrowRight size={16} />
          </button>
        </div>
      </dialog>
      <dialog ref={edit} className="dialog edit-dialog">
        <button
          className="dialog-close icon-button"
          aria-label="Close campaign editor"
          onClick={() => edit.current?.close()}
        >
          <X size={18} />
        </button>
        <p className="eyebrow">SERIES 01 / CAMPAIGN SETTINGS</p>
        <h2>Shape the drop.</h2>
        <CampaignForm
          key={JSON.stringify(c) + JSON.stringify(data.weights)}
          campaign={c}
          weights={data.weights}
          onSaved={() => edit.current?.close()}
        />
      </dialog>
    </section>
  );
}
function CampaignForm({
  campaign: c,
  weights,
  onSaved,
}: {
  campaign: Campaign;
  weights: number[];
  onSaved: () => void;
}) {
  const { act, busy } = useLoop();
  const toLocal = (date: number) => {
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  return (
    <form
      className="campaign-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const result = await act({
          action: 'edit',
          changes: {
            name: String(f.get('name')),
            description: String(f.get('description')),
            price: Math.round(Number(f.get('price')) * 100),
            capacity: Number(f.get('capacity')),
            max_per_user: Number(f.get('limit')),
            starts_at: new Date(String(f.get('starts'))).getTime(),
            ends_at: new Date(String(f.get('ends'))).getTime(),
            trade_ends_at: new Date(String(f.get('tradeEnds'))).getTime(),
            weights: characters.map((ch) => Number(f.get(ch.id))),
          },
        });
        if (result) onSaved();
      }}
    >
      <label>
        Campaign name
        <input name="name" required minLength={2} maxLength={60} defaultValue={c.name} />
      </label>
      <label>
        Story
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={500}
          defaultValue={c.description}
        />
      </label>
      <div className="form-row">
        <label>
          Price (SGD)
          <input
            name="price"
            type="number"
            required
            min="1"
            max="1000"
            step="0.01"
            defaultValue={c.price / 100}
          />
        </label>
        <label>
          Production cap
          <input
            name="capacity"
            type="number"
            required
            min={c.confirmed}
            max="10000"
            defaultValue={c.capacity}
          />
        </label>
        <label>
          Per collector
          <input
            name="limit"
            type="number"
            required
            min="1"
            max="10"
            defaultValue={c.max_per_user}
          />
        </label>
      </div>
      <label>
        Preorders start
        <input name="starts" type="datetime-local" required defaultValue={toLocal(c.starts_at)} />
      </label>
      <label>
        Preorders end
        <input name="ends" type="datetime-local" required defaultValue={toLocal(c.ends_at)} />
      </label>
      <label>
        Trades end
        <input
          name="tradeEnds"
          type="datetime-local"
          required
          defaultValue={toLocal(c.trade_ends_at)}
        />
      </label>
      <fieldset>
        <legend>Allocation weights</legend>
        <p className="fine">
          Relative weights for non-demo allocation. The demo reveal remains deterministic.
        </p>
        <div className="weights-grid">
          {characters.map((ch, i) => (
            <label key={ch.id}>
              {ch.name}
              <input
                name={ch.id}
                type="number"
                min="0.01"
                max="10000"
                step="0.01"
                required
                defaultValue={weights[i]}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <button className="button primary wide" disabled={busy}>
        Save campaign <Check size={16} />
      </button>
    </form>
  );
}
function exportPlan(analytics: Analytics, c: Campaign, locked: boolean) {
  const csv = [
    'Campaign,Plan status,Character,Rarity,Quantity',
    ...analytics.distribution.map((d) =>
      [c.name, locked ? 'FINAL' : 'PROVISIONAL', d.name, d.rarity, d.quantity]
        .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
        .join(','),
    ),
  ].join('\r\n');
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.href = url;
  link.download = 'loopbox-production-plan.csv';
  link.click();
  URL.revokeObjectURL(url);
}
