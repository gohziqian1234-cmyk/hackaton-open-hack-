'use client';
import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useLoop } from './provider';
import { Loading } from './shell';
import { phaseLabel, phases, sgd } from '../lib/catalog';
import type { AdminCampaign, AuditRow } from '../lib/types';
import { Button, ErrorNote, Stat } from './ui';

type ApplicationRow = {
  id: string;
  type: 'BRAND' | 'COLLECTIVE';
  org_name: string;
  contact_email: string;
  website: string | null;
  proof_url: string | null;
  portfolio_url: string | null;
  members_count: number | null;
  proposed_series: string;
  ip_statement: string;
  status: string;
  admin_note: string | null;
  created_at: number;
};
type ReportRow = {
  id: string;
  reason: string;
  details: string | null;
  status: 'OPEN' | 'UPHELD' | 'DISMISSED';
  created_at: number;
  market_order_id: string;
  title: string;
  seller: string;
  trust: number;
  subtotal_cents: number;
};
type Console = {
  campaigns: AdminCampaign[];
  audit: AuditRow[];
  applications: ApplicationRow[];
  reports: ReportRow[];
};
const reportReasons: Record<string, string> = {
  WRONG_ITEM: 'Different character',
  MISSING_ITEM: 'Something missing',
  NOT_DELIVERED: 'Nothing arrived',
  OTHER: 'Other',
};
const ENTITIES = [
  '',
  'order',
  'allocation',
  'campaign',
  'match',
  'application',
  'listing',
  'market_order',
  'report',
  'system',
];

export function AdminConsole({ extra }: { extra?: React.ReactNode }) {
  const { act, busy } = useLoop(),
    [data, setData] = useState<Console | null>(null),
    [failed, setFailed] = useState(''),
    [entity, setEntity] = useState(''),
    [version, setVersion] = useState(0),
    [confirming, setConfirming] = useState(''),
    [swept, setSwept] = useState(''),
    [notes, setNotes] = useState<Record<string, string>>({});
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
          <p className="lead">
            Publish and close drops, clean up stale orders, read the audit trail.
          </p>
        </div>
        <button className="icon-btn" aria-label="Refresh admin data" onClick={reload}>
          <RefreshCw size={18} />
        </button>
      </div>
      <dl className="stats">
        <Stat label="Campaigns" value={data.campaigns.length} />
        <Stat label="Live now" value={live} />
        <Stat label="Unpaid orders" value={data.campaigns.reduce((n, c) => n + c.pending, 0)} />
        <Stat label="Open reports" value={data.reports.filter((r) => r.status === 'OPEN').length} />
      </dl>
      <section className="card console-section" aria-labelledby="campaigns-heading">
        <h2 id="campaigns-heading" className="h3">
          Campaigns
        </h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Campaigns table">
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
                            disabled={busy}
                            onClick={() => run({ action: 'publishCampaign', campaignId: c.id })}
                          >
                            Publish {c.name}
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
          <p>
            Expires unpaid orders past their payment window, re-runs trade matching and completes
            marketplace orders handed over more than 7 days ago.
          </p>
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
      <section className="card console-section" aria-labelledby="applications-heading">
        <h2 id="applications-heading" className="h3">
          Partner applications
        </h2>
        {data.applications.length === 0 ? (
          <p>No applications yet.</p>
        ) : (
          <ul className="application-list">
            {data.applications.map((a) => (
              <li key={a.id} className="application">
                <div className="section-head">
                  <div>
                    <strong>{a.org_name}</strong>
                    <span className="cell-sub">
                      {a.type === 'BRAND'
                        ? 'Brand collaborator'
                        : `Creator collective, ${a.members_count} members`}{' '}
                      · {a.contact_email}
                    </span>
                  </div>
                  <span className="phase-chip">{a.status.replace('_', ' ').toLowerCase()}</span>
                </div>
                <p>{a.proposed_series}</p>
                <p className="note">Rights: {a.ip_statement}</p>
                <p className="note">
                  {[a.website, a.proof_url, a.portfolio_url].filter(Boolean).map((url) => (
                    <a key={url} href={url!} rel="noopener noreferrer nofollow" target="_blank">
                      {url}
                    </a>
                  ))}
                </p>
                {a.status === 'SUBMITTED' && (
                  <div className="decision">
                    <label className="inline-field">
                      <span>Note</span>
                      <input
                        value={notes[a.id] ?? ''}
                        maxLength={500}
                        onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                        aria-label={'Note for ' + a.org_name}
                      />
                    </label>
                    <div className="row table-actions">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          run({
                            action: 'decideApplication',
                            applicationId: a.id,
                            decision: 'APPROVE',
                            note: notes[a.id],
                          })
                        }
                      >
                        Approve {a.org_name}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy || !notes[a.id]}
                        onClick={() =>
                          run({
                            action: 'decideApplication',
                            applicationId: a.id,
                            decision: 'REQUEST_INFO',
                            note: notes[a.id],
                          })
                        }
                      >
                        Request info
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          run({
                            action: 'decideApplication',
                            applicationId: a.id,
                            decision: 'REJECT',
                            note: notes[a.id],
                          })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
                {a.admin_note && a.status !== 'SUBMITTED' && (
                  <p className="note">Note: {a.admin_note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card console-section" aria-labelledby="reports-heading">
        <h2 id="reports-heading" className="h3">
          Marketplace reports
        </h2>
        {data.reports.length === 0 ? (
          <p>No reports. Buyers report here when a box doesn’t match its draw.</p>
        ) : (
          <ul className="application-list">
            {data.reports.map((r) => (
              <li key={r.id} className="application">
                <div className="section-head">
                  <div>
                    <strong>{r.title}</strong>
                    <span className="cell-sub">
                      Seller {r.seller} · trust {r.trust} · {sgd(r.subtotal_cents)}
                    </span>
                  </div>
                  <span className="phase-chip">{r.status.toLowerCase()}</span>
                </div>
                <p>
                  {reportReasons[r.reason] ?? r.reason}
                  {r.details ? `: ${r.details}` : ''}
                </p>
                {r.status === 'OPEN' && (
                  <div className="row table-actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run({ action: 'resolveReport', reportId: r.id, decision: 'UPHOLD' })
                      }
                    >
                      Uphold and refund
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run({ action: 'resolveReport', reportId: r.id, decision: 'DISMISS' })
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
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
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Audit trail table">
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
