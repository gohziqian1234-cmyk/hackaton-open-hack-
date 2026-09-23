'use client';
import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useLoop } from './provider';
import { Loading } from './shell';
import { phaseLabel, phases, sgd } from '../lib/catalog';
import type { AdminCampaign, AuditRow } from '../lib/types';
import { Button, ErrorNote, Stat } from './ui';

type Console = { campaigns: AdminCampaign[]; audit: AuditRow[] };
const ENTITIES = ['', 'order', 'allocation', 'campaign', 'match', 'application', 'listing', 'market_order', 'report', 'system'];

export function AdminConsole({ extra }: { extra?: React.ReactNode }) {
  const { act, busy } = useLoop(),
    [data, setData] = useState<Console | null>(null),
    [failed, setFailed] = useState(''),
    [entity, setEntity] = useState(''),
    [version, setVersion] = useState(0),
    [confirming, setConfirming] = useState(''),
    [swept, setSwept] = useState('');
  useEffect(() => {
    fetch('/api/admin' + (entity ? '?entity=' + entity : ''), { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Admin data didn’t load.');
        return r.json();
      })
      .then((d: Console) => {
        setFailed('');
        setData(d);
      })
      .catch((e) => setFailed(e.message));
  }, [entity, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const run = async (body: Record<string, unknown>) => {
    setConfirming('');
    const r = await act(body);
    if (r) reload();
    return r;
  };
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="Admin console" onRetry={reload}>
          {failed}
        </ErrorNote>
      </section>
    );
  if (!data) return <Loading />;
  const live = data.campaigns.filter((c) => c.phase === 'ACTIVE_PREORDER').length;
  return (
    <section className="wrap console">
      <div className="page-heading">
        <div>
          <h1>Admin console</h1>
          <p className="lead">Publish and close drops, clean up stale orders, read the audit trail.</p>
        </div>
        <button className="icon-btn" aria-label="Refresh admin data" onClick={reload}>
          <RefreshCw size={18} />
        </button>
      </div>
      <dl className="stats">
        <Stat label="Campaigns" value={data.campaigns.length} />
        <Stat label="Live now" value={live} />
        <Stat
          label="Unpaid orders"
          value={data.campaigns.reduce((n, c) => n + c.pending, 0)}
        />
        <Stat label="Audit rows shown" value={data.audit.length} />
      </dl>
      <section className="card console-section" aria-labelledby="campaigns-heading">
        <h2 id="campaigns-heading" className="h3">
          Campaigns
        </h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Campaign</th>
                <th scope="col">Partner</th>
                <th scope="col">Phase</th>
                <th scope="col" className="num">
                  Sold
                </th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => {
                const next = phases[phases.indexOf(c.phase as (typeof phases)[number]) + 1];
                return (
                  <tr key={c.id}>
                    <th scope="row">
                      {c.name}
                      <span className="cell-sub">{sgd(c.price)} a box</span>
                    </th>
                    <td>{c.partner ?? '—'}</td>
                    <td>
                      <span className="phase-chip">{phaseLabel(c.phase)}</span>
                    </td>
                    <td className="num">
                      {c.paid}/{c.capacity}
                      {c.pending > 0 && <span className="cell-sub">{c.pending} unpaid</span>}
                    </td>
                    <td>
                      <div className="row table-actions">
                        {c.phase === 'IN_REVIEW' && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => run({ action: 'publishCampaign', campaignId: c.id })}
                          >
                            Publish
                          </Button>
                        )}
                        {c.phase === 'ACTIVE_PREORDER' &&
                          (confirming === c.id ? (
                            <Button
                              disabled={busy}
                              onClick={() => run({ action: 'closeCampaign', campaignId: c.id })}
                            >
                              Confirm close
                            </Button>
                          ) : (
                            <Button variant="ghost" onClick={() => setConfirming(c.id)}>
                              Close preorder
                            </Button>
                          ))}
                        {next && c.phase !== 'ACTIVE_PREORDER' && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => run({ action: 'advance', campaignId: c.id })}
                          >
                            Move to {phaseLabel(next).toLowerCase()}
                          </Button>
                        )}
                        {c.pool > 0 && (
                          <a
                            className="icon-btn"
                            href={'/api/manifest?campaign=' + c.id}
                            aria-label={'Download manifest for ' + c.name}
                          >
                            <Download size={18} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card console-section sweep" aria-labelledby="sweep-heading">
        <div>
          <h2 id="sweep-heading" className="h3">
            Sweep
          </h2>
          <p>Expires unpaid orders past their payment window and re-runs trade matching.</p>
          {swept && (
            <p className="note" role="status">
              {swept}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            const r = await run({ action: 'sweep' });
            if (r) {
              const counts = r as Record<string, number>;
              setSwept(
                Object.entries(counts)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(', ') + '.',
              );
            }
          }}
        >
          Run sweep
        </Button>
      </section>
      {extra}
      <section className="card console-section" aria-labelledby="audit-heading">
        <div className="section-head">
          <h2 id="audit-heading" className="h3">
            Audit trail
          </h2>
          <label className="inline-field">
            <span>Show</span>
            <select value={entity} onChange={(e) => setEntity(e.target.value)}>
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {e ? e.replace('_', ' ') : 'everything'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="note">Append-only. Records hold ids only, never names, emails or phones.</p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Action</th>
                <th scope="col">Record</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.map((row) => (
                <tr key={row.id}>
                  <td>
                    {new Date(row.created_at).toLocaleString('en-SG', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </td>
                  <th scope="row">{row.action}</th>
                  <td>
                    {row.entity} <code>{row.entity_id.slice(0, 8)}</code>
                  </td>
                  <td>
                    <code>{row.actor_id ? row.actor_id.slice(0, 12) : 'system'}</code>
                  </td>
                </tr>
              ))}
              {data.audit.length === 0 && (
                <tr>
                  <td colSpan={4}>No records yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
