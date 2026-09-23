'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ScanLine } from 'lucide-react';
import { api, messageFor, useLoop } from './provider';
import { Pending } from './shell';
import { Button, Empty, ErrorNote } from './ui';
import { OpeningSequence } from './opening';
import type { Claimed } from './scanner';
import { themeFor } from '../lib/links';
import { serialLabel } from '../lib/format';

/** /claim/[code]: what a phone camera opens from the QR on a figure. Same claim as "Add more". */
export function ClaimPage() {
  const { code } = useParams<{ code: string }>();
  const { data, refresh, login, busy } = useLoop();
  const router = useRouter();
  const [result, setResult] = useState<Claimed | null>(null);
  const [error, setError] = useState('');
  const tried = useRef(false);
  const signedIn = data?.user?.role === 'COLLECTOR';
  useEffect(() => {
    if (!signedIn || tried.current) return;
    tried.current = true;
    api<Claimed>({ action: 'claimPhysical', code })
      .then(async (r) => {
        await refresh().catch(() => {});
        setResult(r);
      })
      .catch((e: { code?: string }) => setError(e.code ?? 'SERVER_ERROR'));
  }, [signedIn, code, refresh]);
  if (!data) return <Pending />;
  if (!data.user)
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="Sign in to add this figure."
          icon={<ScanLine size={26} />}
          action={
            data.demo ? (
              <Button disabled={busy} onClick={() => login('collector')}>
                Continue as the demo collector
              </Button>
            ) : (
              <Button href={'/login?next=' + encodeURIComponent('/claim/' + code)}>Sign in</Button>
            )
          }
        >
          The figure goes into the collection of whoever adds it first. We’ll bring you back here.
        </Empty>
      </section>
    );
  if (data.user.role !== 'COLLECTOR')
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="Use a collector account.">
          Physical figures are added to collector accounts. Switch account and open the link again.
        </ErrorNote>
      </section>
    );
  if (error)
    return (
      <section className="wrap page-pad">
        <ErrorNote
          heading="h1"
          title={
            error === 'ALREADY_YOURS'
              ? 'Already in your collection.'
              : error === 'ALREADY_CLAIMED'
                ? 'Someone already added this figure.'
                : error === 'RATE_LIMITED'
                  ? 'Too many tries.'
                  : 'That code didn’t work.'
          }
        >
          {messageFor(error)}
          {error === 'ALREADY_CLAIMED' &&
            ' If you own it, contact support with a photo of the figure and its card.'}
        </ErrorNote>
        <div className="row center">
          <Button href="/collection?tab=physical">My collection</Button>
        </div>
      </section>
    );
  if (!result) return <Pending />;
  const theme = themeFor(data.themes, result.character.campaign_id);
  return (
    <section className="reveal-page">
      <OpeningSequence
        theme={theme}
        character={result.character}
        capacity={result.figure.cap}
        startAt="reveal"
        keepLabel="Show my collection"
        onKeep={() => router.push('/collection?tab=physical')}
      >
        <p className="verified-line">
          <BadgeCheck size={20} aria-hidden="true" /> Verified physical ·{' '}
          <span className="tabular">{serialLabel(result.figure.serial_no, result.figure.cap)}</span>
        </p>
      </OpeningSequence>
    </section>
  );
}
