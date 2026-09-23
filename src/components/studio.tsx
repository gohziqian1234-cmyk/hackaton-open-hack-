'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Download, Factory, RefreshCw, Settings2, X } from 'lucide-react';
import { useCampaign, useLoop } from './provider';
import { Loading, Pending } from './shell';
import { characters, phaseIndex, phaseLabel, phases, sgd } from '../lib/catalog';
import { percent, sellThrough } from '../domain/metrics';
import { Button, Empty, ErrorNote, Stat } from './ui';
import { AdminConsole } from './admin';
import type { Analytics, Campaign } from '../lib/types';
export function Studio() {
  const data = useCampaign('astral'),
    { login, act, busy } = useLoop(),
    [analytics, setAnalytics] = useState<Analytics | null>(null),
    [fetchError, setFetchError] = useState(''),
    [version, setVersion] = useState(0);
  const edit = useRef<HTMLDialogElement>(null),
    advance = useRef<HTMLDialogElement>(null);
  const role = data?.user?.role;
  useEffect(() => {
    if (role !== 'BUSINESS') return;
    fetch('/api/loopbox?analytics=1', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 403) throw new Error('NOT_ASTRAL');
        if (!r.ok) throw new Error('Studio data is unavailable. Please retry.');
        return r.json();
      })
      .then((a) => {
        setFetchError('');
        setAnalytics(a);
      })
      .catch((e) => setFetchError(e.message));
  }, [data, role, version]);
  if (!data) return <Pending />;
  if (role === 'ADMIN') return <AdminConsole />;
  if (role !== 'BUSINESS')
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="The maker studio"
          icon={<Factory size={26} />}
          action={
            <Button disabled={busy} onClick={() => login('business')}>
              Enter demo studio
            </Button>
          }
        >
          See confirmed demand and decide what to make. The demo signs you in as Astral Studio.
        </Empty>
      </section>
    );
  if (fetchError === 'NOT_ASTRAL')
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="This studio belongs to Astral Studio"
          action={<Button href="/partner">Open your partner dashboard</Button>}
        >
          Your own campaigns, stats and manifests are on the partner dashboard.
        </Empty>
      </section>
    );
  if (!analytics)
    return fetchError ? (
      <section className="wrap page-pad">
        <ErrorNote
          heading="h1"
          title="Studio numbers didn’t load."
          onRetry={() => setVersion((v) => v + 1)}
          retryLabel="Retry studio data"
        >
          {fetchError}
        </ErrorNote>
      </section>
    ) : (
      <Loading />
    );
  const c = data.campaign,
    index = phaseIndex(c.phase),
    locked = index >= 4,
    next = phases[index + 1],
    peak = Math.max(1, ...analytics.distribution.map((d) => d.quantity));
  return (
    <section className="wrap studio">
      <div className="page-heading">
        <div>
          <h1>Demand, before making.</h1>
          <p className="lead">Astral Studio. Live numbers for {c.name}, updated on every order.</p>
        </div>
        <div className="row">
          <button
            className="icon-btn"
            aria-label="Refresh analytics"
            onClick={() => setVersion((v) => v + 1)}
          >
            <RefreshCw size={18} />
          </button>
          <Button variant="ghost" disabled={index > 1} onClick={() => edit.current?.showModal()}>
            <Settings2 size={18} aria-hidden="true" /> Edit campaign
          </Button>
        </div>
      </div>
      <div className="card studio-bar">
        <div>
          <p className="studio-bar-label">
            Series 01, {sgd(c.price)} a box, cap {c.capacity}
          </p>
          <h2 className="h3">{c.name}</h2>
        </div>
        <span className="phase-chip">{phaseLabel(c.phase)}</span>
        {next && (
          <Button onClick={() => advance.current?.showModal()}>Advance campaign</Button>
        )}
      </div>
      <dl className="stats">
        <Stat label="Plays" value={analytics.plays} />
        <Stat label="Wins" value={analytics.wins} />
        <Stat label="Win rate" value={percent(analytics.winRate)} />
        <Stat label="Confirmed orders" value={analytics.orders} />
        <Stat label="Sell-through" value={percent(sellThrough(analytics.orders, c.capacity))} />
        <Stat label="Trades" value={analytics.trades} />
      </dl>
      <div className="studio-grid">
        <section className="card production" aria-labelledby="plan-heading">
          <div className="production-head">
            <div>
              <p className="studio-bar-label">
                {locked ? 'Final manufacturing plan' : 'Live allocation plan'}
              </p>
              <h2 id="plan-heading" className="h3">
                {locked ? 'Ready to make.' : 'What we would make today.'}
              </h2>
            </div>
            <div className="row">
              <button
                className="icon-btn"
                aria-label="Download production CSV"
                onClick={() => exportPlan(analytics, c, locked)}
              >
                <Download size={18} />
              </button>
              <a className="btn btn-ghost" href={'/api/manifest?campaign=' + c.id} download>
                Download manifest
              </a>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Collectible</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Demand</th>
                  <th scope="col" className="num">
                    Units
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.distribution.map((row) => {
                  const color = characters.find((ch) => ch.id === row.id)?.color;
                  return (
                    <tr key={row.id}>
                      <th scope="row">
                        <span className="table-dot" style={{ background: color }} />
                        {row.name}
                      </th>
                      <td>{tierLabel(row.rarity)}</td>
                      <td>
                        <div className="demand-bar">
                          <span
                            style={{ width: (row.quantity / peak) * 100 + '%', background: color }}
                          />
                        </div>
                      </td>
                      <td className="num">{row.quantity}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    Total {locked ? 'to manufacture' : 'confirmed'}
                  </th>
                  <td className="num">{analytics.orders}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="note">
            {locked
              ? 'Allocations are locked. This is the final quantity to make.'
              : 'Trades can still change who owns each box, never how many exist.'}
          </p>
        </section>
        <aside className="card funnel">
          <h2 className="h3">The journey so far</h2>
          <dl className="funnel-list">
            <div>
              <dt>Players</dt>
              <dd>{analytics.players}</dd>
            </div>
            <div>
              <dt>Games finished</dt>
              <dd>{analytics.completions}</dd>
            </div>
            <div>
              <dt>Slots earned</dt>
              <dd>{analytics.unlocks}</dd>
            </div>
            <div>
              <dt>Confirmed orders</dt>
              <dd>{analytics.orders}</dd>
            </div>
            <div>
              <dt>Boxes opened</dt>
              <dd>{analytics.opened}</dd>
            </div>
            <div>
              <dt>Offered for trade</dt>
              <dd>{analytics.listings}</dd>
            </div>
          </dl>
          <p className="note">
            93 orders are seeded demo history. Unmade capacity ({c.capacity - analytics.orders}{' '}
            boxes) is cap minus orders, not a measured saving.
          </p>
        </aside>
      </div>
      <ol className="timeline" aria-label="Campaign phases">
        {phases.slice(1).map((p, i) => (
          <li
            key={p}
            className={i + 1 < index ? 'passed' : i + 1 === index ? 'current' : ''}
            aria-current={i + 1 === index ? 'step' : undefined}
          >
            <span>{i + 1 < index ? <Check size={14} aria-hidden="true" /> : i + 1}</span>
            {phaseLabel(p)}
          </li>
        ))}
      </ol>
      <dialog ref={advance} className="dialog">
        <button
          className="dialog-close icon-btn"
          aria-label="Close phase dialog"
          onClick={() => advance.current?.close()}
        >
          <X size={18} />
        </button>
        <h2 className="h3">Move to: {next ? phaseLabel(next) : ''}</h2>
        <p>
          {next === 'ALLOCATION_LOCKED'
            ? 'This freezes who owns every box, cancels pending trades and closes trading. The result becomes the final manufacturing plan.'
            : next === 'PREORDER_CLOSED'
              ? 'This stops new orders. Collectors can still trade until the trade window ends.'
              : 'This moves the campaign to its next stage for every collector.'}
        </p>
        <div className="row">
          <Button variant="ghost" onClick={() => advance.current?.close()}>
            Keep current phase
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              const r = await act({ action: 'advance' });
              if (r) advance.current?.close();
            }}
          >
            Confirm phase change
          </Button>
        </div>
      </dialog>
      <dialog ref={edit} className="dialog edit-dialog">
        <button
          className="dialog-close icon-btn"
          aria-label="Close campaign editor"
          onClick={() => edit.current?.close()}
        >
          <X size={18} />
        </button>
        <h2 className="h3">Campaign settings</h2>
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
const tierLabel = (rarity: string) => rarity.charAt(0) + rarity.slice(1).toLowerCase();
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
            required_score: Number(f.get('required_score')),
            attempts_per_day: Number(f.get('attempts_per_day')),
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
      <div className="form-row">
        <label>
          Stars needed to win (1–15)
          <input
            name="required_score"
            type="number"
            required
            min="1"
            max="15"
            defaultValue={c.required_score}
          />
        </label>
        <label>
          Tries per person per day (1–20)
          <input
            name="attempts_per_day"
            type="number"
            required
            min="1"
            max="20"
            defaultValue={c.attempts_per_day}
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
        <p className="note">
          Relative weights, used only outside demo mode. The demo reveal is always Eclipse Knight.
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
      <Button type="submit" wide disabled={busy}>
        Save campaign
      </Button>
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
