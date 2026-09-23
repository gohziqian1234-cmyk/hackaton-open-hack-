'use client';
import { useState } from 'react';
import { Printer } from 'lucide-react';
import { useLoop } from './provider';
import { Pending } from './shell';
import { Button, ErrorNote } from './ui';
import { serialLabel } from '../lib/format';

type Row = {
  id: string;
  code: string;
  url: string;
  character: string;
  rarity: string;
  serial_no: number;
  cap: number;
  qr: string;
};

/**
 * ADMIN: generate physical figure codes and print them. Codes exist only in this page's memory:
 * the server keeps a SHA-256 fingerprint, so a sheet cannot be re-printed after you leave.
 */
export function QrSheet() {
  const { data, act, busy } = useLoop();
  const [theme, setTheme] = useState('');
  const [count, setCount] = useState(20);
  const [rows, setRows] = useState<Row[]>([]);
  if (!data) return <Pending />;
  if (data.user?.role !== 'ADMIN')
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="Admins only.">
          The QR sheet creates codes for physical figures. Sign in with an admin account.
        </ErrorNote>
      </section>
    );
  const live = data.themes.filter((t) => t.status === 'live' && t.sort_order < 1000);
  const chosen = theme || live[0]?.slug || '';
  const themeName = live.find((t) => t.slug === chosen)?.name ?? '';
  const generate = async () => {
    const r = await act<Row[]>({ action: 'generatePhysical', themeSlug: chosen, count });
    if (r) setRows(r);
  };
  return (
    <section className="wrap qr-sheet-page">
      <div className="qr-controls no-print">
        <h1>QR sheet</h1>
        <p className="lead">
          Make codes for physical figures, then print this page on A4 and stick one on each
          figure’s base or box. Each code works once.
        </p>
        <p className="notice">
          We only keep a fingerprint of each code, so print before you leave this page. Codes
          can’t be shown again.
        </p>
        <div className="form-row qr-form">
          <label>
            Theme
            <select value={chosen} onChange={(e) => setTheme(e.target.value)}>
              {live.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            How many
            <input
              type="number"
              min={1}
              max={60}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            />
          </label>
          <Button disabled={busy || !chosen} onClick={generate}>
            Generate codes
          </Button>
          {rows.length > 0 && (
            <Button variant="ghost" onClick={() => window.print()}>
              <Printer size={18} aria-hidden="true" /> Print sheet
            </Button>
          )}
        </div>
      </div>
      {rows.length > 0 && (
        <>
          <h2 className="qr-sheet-title">
            {themeName}: {rows.length} figure codes
          </h2>
          <ul className="qr-grid">
            {rows.map((r) => (
              <li key={r.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.qr} alt={'QR code for ' + r.character + ' ' + serialLabel(r.serial_no, r.cap)} width={160} height={160} />
                <strong>{r.character}</strong>
                <span className="tabular">{serialLabel(r.serial_no, r.cap)}</span>
                <code>{r.code}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
