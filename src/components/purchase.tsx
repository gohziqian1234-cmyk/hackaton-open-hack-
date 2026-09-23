'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Check, Download, Loader } from 'lucide-react';
import { useLoop } from './provider';
import { Pending } from './shell';
import { OpeningSequence } from './opening';
import { charOf } from './checkout';
import { getCharacterImage } from '../lib/images';
import { themeFor } from '../lib/links';
import type { Allocation, CharacterInfo, Snapshot, ThemeInfo } from '../lib/types';
import { Button, Empty, ErrorNote } from './ui';
const POLL_MS = 1500,
  POLL_LIMIT_MS = 60000;
/** Never allocates. Waits until the server has confirmed payment, then offers the box. */
export function CheckoutSuccess() {
  const { data, refresh, act, busy } = useLoop(),
    router = useRouter(),
    params = useSearchParams(),
    sessionId = params.get('session_id'),
    orderId = params.get('order'),
    [started, setStarted] = useState(() => Date.now()),
    [timedOut, setTimedOut] = useState(false);
  const order = data?.orders.find(
    (o) => (orderId && o.id === orderId) || (sessionId && o.session_id === sessionId),
  );
  const paid = order && (order.status === 'PAID' || order.status === 'DEMO_PAID');
  useEffect(() => {
    if (paid || timedOut) return;
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_LIMIT_MS) setTimedOut(true);
      else refresh().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [paid, timedOut, started, refresh]);
  if (!data) return <Pending />;
  return (
    <section className="wrap page-pad checkout-status">
      {paid && order?.allocation_id ? (
        <div className="status-card card">
          <span className="status-icon ok" aria-hidden="true">
            <Check size={30} />
          </span>
          <h1>Payment confirmed.</h1>
          <p className="lead">Your box has been assigned. Open it whenever you are ready.</p>
          <Button onClick={() => router.push('/reveal/' + order.allocation_id + '?open=1')}>
            Open my box
          </Button>
        </div>
      ) : order && (order.status === 'EXPIRED' || order.status === 'REFUNDED') ? (
        <ErrorNote
          heading="h1"
          title={order.status === 'REFUNDED' ? 'Payment refunded.' : 'Payment not completed.'}
        >
          {order.status === 'REFUNDED'
            ? 'The last box went before your payment arrived, so we refunded it in full.'
            : 'This payment expired before it finished. Win a new slot to try again.'}
        </ErrorNote>
      ) : timedOut ? (
        <ErrorNote
          heading="h1"
          title="Still waiting for the payment."
          retryLabel="Check again"
          onRetry={() => {
            setTimedOut(false);
            setStarted(Date.now());
          }}
        >
          Stripe hasn’t confirmed this payment yet. Nothing is lost: your seat stays held until the
          payment page expires.
          {data.payment.simulate && order && order.status === 'PENDING_PAYMENT' && (
            <>
              {' '}
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() => act({ orderId: order.id, kind: 'B2C' }, '/api/stripe/simulate')}
              >
                Simulate payment (demo)
              </Button>
            </>
          )}
        </ErrorNote>
      ) : (
        <div className="status-card card" role="status">
          <span className="status-icon" aria-hidden="true">
            <Loader size={30} />
          </span>
          <h1>Waiting for payment…</h1>
          <p className="lead">
            We assign your box only after the payment is confirmed. This usually takes a few
            seconds.
          </p>
        </div>
      )}
    </section>
  );
}
/** /reveal/[id]: a box paid through the v1 pay-first flow, opened with the v2 sequence. */
export function Reveal() {
  const params = useParams<{ id: string }>(),
    { data, act } = useLoop();
  if (!data) return <Pending />;
  const existing = data.collection.find((a) => a.id === params.id);
  if (!existing)
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="This box isn’t in your collection."
          action={<Button href="/collection">Back to my collection</Button>}
        >
          It may belong to another account, or the link is wrong.
        </Empty>
      </section>
    );
  const theme = themeFor(data.themes, existing.campaign_id);
  const capacity =
    data.campaigns.find((c) => c.id === existing.campaign_id)?.capacity ?? data.campaign.capacity;
  const shownId = existing.character_id;
  const ch = shownId ? charOf(data, shownId) : undefined;
  const requestDraw = async () => {
    const a = await act<Allocation>({ action: 'reveal', allocationId: params.id });
    return a ? (charOf(data, a.character_id) ?? null) : null;
  };
  return (
    <section className="reveal-page">
      <OpeningSequence
        theme={theme}
        character={existing.revealed && ch ? ch : null}
        capacity={capacity}
        requestDraw={requestDraw}
        startAt={existing.revealed ? 'reveal' : 'box'}
        animateReveal={!existing.revealed}
        tradeHref={'/trades?allocation=' + params.id}
        tradeLabel="Find a trade"
        keepHref="/collection"
        keepLabel="Keep my kin"
      >
        <RevealExtras data={data} theme={theme} characterId={shownId} excludeAllocation={params.id} />
      </OpeningSequence>
    </section>
  );
}
/** Duplicate note and Save card, under the revealed character. */
export function RevealExtras({
  data,
  theme,
  characterId,
  excludeAllocation,
  excludeItem,
}: {
  data: Snapshot;
  theme: ThemeInfo | null;
  characterId: string | undefined;
  excludeAllocation?: string;
  excludeItem?: string;
}) {
  const ch = characterId ? charOf(data, characterId) : undefined;
  if (!ch) return null;
  const owned =
    data.collection.filter((a) => a.character_id === ch.id && a.id !== excludeAllocation).length +
    data.items.filter(
      (i) =>
        i.character_id === ch.id &&
        i.id !== excludeItem &&
        i.state === 'opened',
    ).length;
  return (
    <>
      {owned > 0 && (
        <div className="dup">
          You have a duplicate. <b>Swap it for another {ch.rarity.toLowerCase()}.</b>
        </div>
      )}
      <Button variant="quiet" onClick={() => downloadCard(ch, theme)}>
        <Download size={18} aria-hidden="true" /> Save card
      </Button>
    </>
  );
}
/** A shareable 1080×1920 card. Kit images are drawn in; other art shows a question mark. */
export async function downloadCard(ch: CharacterInfo, theme: ThemeInfo | null) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const display = "'Unbounded Variable', system-ui, sans-serif",
    body = "'Figtree Variable', system-ui, sans-serif";
  const themeName = theme?.name ?? 'Astral Kin';
  ctx.fillStyle = '#14112A';
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.strokeStyle = 'rgba(242,240,255,0.18)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(540, 820, 260 + i * 65, 320 + i * 65, -0.25, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD84D';
  ctx.font = '700 34px ' + body;
  ctx.fillText(themeName + ' by LoopBox', 540, 210);
  const img = getCharacterImage(theme?.slug ?? ch.campaign_id, ch.slug ?? ch.id, 'hero');
  const drawn =
    img.kind === 'image' &&
    (await new Promise<boolean>((done) => {
      const el = new Image();
      el.onload = () => {
        ctx.drawImage(el, 290, 360, 500, 750);
        done(true);
      };
      el.onerror = () => done(false);
      el.src = img.src;
    }));
  if (!drawn) {
    ctx.font = '800 170px ' + display;
    ctx.fillText('?', 540, 900);
  }
  ctx.fillStyle = '#F2F0FF';
  ctx.font = '800 72px ' + display;
  ctx.fillText(ch.name, 540, 1270);
  ctx.fillStyle = '#A9A3CF';
  ctx.font = '600 34px ' + body;
  ctx.fillText(
    ch.rarity.charAt(0) + ch.rarity.slice(1).toLowerCase() + ' tier',
    540,
    1360,
  );
  ctx.fillStyle = '#F2F0FF';
  ctx.font = '500 38px ' + body;
  ctx.fillText('Collect the surprise. Produce only what’s wanted.', 540, 1580);
  ctx.fillStyle = '#A9A3CF';
  ctx.font = '500 28px ' + body;
  ctx.fillText(
    theme?.licensed ? 'Concept render — demo only, not licensed' : 'Digital collectible card from a hackathon demo',
    540,
    1770,
  );
  const link = document.createElement('a');
  link.download = 'loopbox-my-' + (theme?.slug ?? 'astral-kin') + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}
