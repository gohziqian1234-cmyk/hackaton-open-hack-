'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Download, ShieldAlert } from 'lucide-react';
import type { Verification } from '../lib/types';
import { buildPoolWeb, commitmentWeb, shuffleWeb } from '../lib/fairness-web';
import { Loading } from './shell';
import { Button, ErrorNote } from './ui';

type Check =
  | { state: 'idle' | 'checking' }
  | { state: 'done'; browserCommitment: string; match: boolean };

export function Verify() {
  const { campaign } = useParams<{ campaign: string }>(),
    [data, setData] = useState<Verification | null>(null),
    [failed, setFailed] = useState(''),
    [attempt, setAttempt] = useState(0),
    [check, setCheck] = useState<Check>({ state: 'idle' });
  useEffect(() => {
    fetch('/api/verify?campaign=' + encodeURIComponent(campaign), { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 404) throw new Error('We have no fairness record for this drop.');
        if (!r.ok) throw new Error('The fairness record didn’t load.');
        return r.json();
      })
      .then((d: Verification) => {
        setFailed('');
        setData(d);
      })
      .catch((e) => setFailed(e.message));
  }, [campaign, attempt]);
  useEffect(() => {
    if (!data?.seed || !data.order) return;
    let cancelled = false;
    const run = async () => {
      setCheck({ state: 'checking' });
      // Recompute everything here in your browser from the published unit counts and seed.
      const order = await shuffleWeb(buildPoolWeb(data.characters), data.seed!);
      const browserCommitment = await commitmentWeb(data.seed!, order);
      const match =
        browserCommitment === data.commitment && order.join(',') === data.order!.join(',');
      if (!cancelled) setCheck({ state: 'done', browserCommitment, match });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [data]);
  const download = useCallback(() => {
    if (!data?.order) return;
    const csv = ['position,character_id', ...data.order.map((id, i) => `${i},${id}`)].join('\r\n');
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.href = url;
    link.download = `shuffle-${data.campaign.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data]);
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="Check the draw yourself" onRetry={() => setAttempt((n) => n + 1)}>
          {failed}
        </ErrorNote>
      </section>
    );
  if (!data) return <Loading />;
  const published = new Date(data.committedAt).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const name = (id: string) => data.characters.find((c) => c.id === id)?.name ?? id;
  return (
    <section className="wrap verify">
      <div className="verify-copy">
        <h1>Check the draw yourself</h1>
        <p className="lead">
          Before the {data.campaign.name} drop opened we shuffled all {data.campaign.capacity}{' '}
          boxes and published a fingerprint of that order. When the preorder closes we reveal the
          shuffle. If the two fingerprints are the same, nobody changed the order after you bought.
        </p>
        {!data.revealed ? (
          <div className="verify-status pending" role="status">
            Fingerprint published {published}. The shuffle will be revealed when the preorder
            closes.
          </div>
        ) : check.state === 'done' ? (
          check.match ? (
            <div className="verify-status ok" role="status">
              <CheckCircle2 size={22} aria-hidden="true" /> Fingerprints match. The order was not
              changed.
            </div>
          ) : (
            <div className="verify-status bad" role="alert">
              <ShieldAlert size={22} aria-hidden="true" /> The fingerprints do not match. The order
              shown is not the one we published.
            </div>
          )
        ) : (
          <div className="verify-status pending" role="status">
            Recomputing the shuffle in your browser…
          </div>
        )}
        {data.yourPositions.length > 0 && (
          <p className="your-box">
            {data.yourPositions
              .map(
                (p) =>
                  `Your box was position ${p}, the ${ordinal(p + 1)} box` +
                  (data.order ? ` (${name(data.order[p])})` : ''),
              )
              .join('. ')}
            .
          </p>
        )}
        <ol className="how-check">
          <li>We put every box in a list: {data.characters.map((c) => `${c.units} ${c.name}`).join(', ')}.</li>
          <li>A secret random number, the seed, shuffled that list.</li>
          <li>We published a fingerprint (SHA-256) of the seed and the shuffled list.</li>
          <li>Each paid order takes the next box in the list. Nobody can choose which.</li>
          <li>At close we reveal the seed so you can redo the shuffle and compare fingerprints.</li>
        </ol>
        {data.demoNote && (
          <p className="note demo-note">
            Demo note: this demo uses a fixed shuffle so the walkthrough is repeatable. The
            fingerprint was still published before any box in the demo was bought.
          </p>
        )}
      </div>
      <div className="verify-proof">
        <div>
          <h2 className="h3">Published before the drop</h2>
          <p className="hash">{data.commitment}</p>
        </div>
        {data.revealed && (
          <>
            <div>
              <h2 className="h3">Recomputed in your browser</h2>
              <p className="hash">
                {check.state === 'done' ? check.browserCommitment : 'Working…'}
              </p>
            </div>
            <div>
              <h2 className="h3">Recomputed by our server</h2>
              <p className="hash">{data.serverCheck?.recomputedCommitment}</p>
            </div>
            <div>
              <h2 className="h3">Revealed seed</h2>
              <p className="hash">{data.seed}</p>
            </div>
            <Button variant="ghost" onClick={download}>
              <Download size={18} aria-hidden="true" /> Download shuffle CSV
            </Button>
          </>
        )}
        <p className="note">
          {data.sold} of {data.campaign.capacity} boxes sold so far. Method: Fisher–Yates shuffle
          where step i swaps with HMAC-SHA256(seed, “i:” + i) mod (i + 1); fingerprint =
          SHA-256(seed + “|” + comma-separated order).
        </p>
      </div>
    </section>
  );
}
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'],
    v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
