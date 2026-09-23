'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Download, Loader, Repeat2 } from 'lucide-react';
import { kinOf, useCampaign, useLoop } from './provider';
import { BoxArt, KinArt } from './art';
import { Pending } from './shell';
import { sgd } from '../lib/catalog';
import type { Allocation } from '../lib/types';
import { Button, Empty, ErrorNote, Perforation, Tier } from './ui';
export function Checkout() {
  const params = useSearchParams(),
    campaignId = params.get('campaign') || 'astral',
    data = useCampaign(campaignId),
    { act, busy } = useLoop(),
    router = useRouter(),
    cancelled = params.get('cancelled') === '1',
    [adult, setAdult] = useState(false),
    released = useRef(false),
    signedIn = !!data?.user;
  useEffect(() => {
    // Back from Stripe's cancel link: close the session and give the slot back while it lasts.
    if (!cancelled || released.current || !signedIn) return;
    released.current = true;
    act({ action: 'cancelCheckout' });
  }, [cancelled, signedIn, act]);
  if (!data) return <Pending />;
  const access = data.access[0],
    c = data.campaign,
    pending = data.orders.find((o) => o.status === 'PENDING_PAYMENT');
  const pay = async () => {
    const result = await act<{ url?: string; simulated?: boolean; orderId: string }>({
      action: 'checkout',
      accessId: access.id,
      ageConfirmed: true,
    });
    if (!result) return;
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    const paid = await act({ orderId: result.orderId, kind: 'B2C' }, '/api/stripe/simulate');
    if (paid) router.push('/checkout/success?order=' + result.orderId);
  };
  const until = (ms: number) =>
    new Date(ms).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
  return (
    <section className="wrap checkout">
      <Link className="back-link" href={'/drop' + (campaignId === 'astral' ? '' : '?campaign=' + campaignId)}>
        <ArrowLeft size={18} aria-hidden="true" /> Back to the drop
      </Link>
      <div className="checkout-grid">
        <div className="checkout-art">
          <BoxArt />
        </div>
        <div className="checkout-main">
          <h1>
            {access ? 'Your slot is ready.' : pending ? 'Payment in progress.' : 'Win a slot first.'}
          </h1>
          {cancelled && access && (
            <p className="notice" role="status">
              Payment cancelled. Your slot is still held until {until(access.expires_at)}.
            </p>
          )}
          <p className="lead">
            {access
              ? `Pay for one sealed ${c.name} box. You open it straight after.`
              : pending
                ? 'You started paying for a box. Finish on the payment page, or check its status.'
                : 'Slots are earned by winning the free game. Play once, then come back here.'}
          </p>
          <div className="panel ticket" aria-label="Order summary">
            <div className="ticket-top">
              <div>
                <span className="ticket-label">{c.name} mystery box</span>
                <strong className="ticket-price">{sgd(c.price)}</strong>
              </div>
              {data.payment.mode === 'simulated' && (
                <span className="demo-flag ticket-flag">Simulated payment (demo)</span>
              )}
              {data.payment.mode === 'stripe' && (
                <span className="demo-flag ticket-flag">Stripe test mode</span>
              )}
            </div>
            <Perforation />
            <dl className="ticket-rows">
              <div>
                <dt>Quantity</dt>
                <dd>1 box</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>After production (simulated)</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{sgd(c.price)} SGD</dd>
              </div>
            </dl>
          </div>
          {access ? (
            <div className="checkout-actions">
              <label className="consent">
                <input
                  type="checkbox"
                  required
                  checked={adult}
                  onChange={(e) => setAdult(e.target.checked)}
                />
                <span>I am 18 or older</span>
              </label>
              <p className="note">
                This is a blind box: you can’t choose the character. The odds are on the drop page,
                and your box is made after allocations lock.
              </p>
              <Button wide disabled={!adult || busy || data.payment.mode === 'unavailable'} onClick={pay}>
                {busy ? 'Opening payment…' : 'Pay with card'}
              </Button>
              <p className="note">
                {data.payment.mode === 'stripe'
                  ? 'You pay on Stripe’s secure page. Test card: 4242 4242 4242 4242, any future date, any CVC.'
                  : data.payment.mode === 'simulated'
                    ? 'Simulated payment (demo): no card details and no money. The same server step a real payment uses assigns your box.'
                    : 'Card payments are not set up on this server yet.'}{' '}
                Slot held until {until(access.expires_at)}.
              </p>
            </div>
          ) : pending ? (
            <div className="row">
              <Button
                href={
                  '/checkout/success?' +
                  (pending.session_id ? 'session_id=' + pending.session_id : 'order=' + pending.id)
                }
              >
                Check payment status
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => act({ action: 'cancelCheckout' })}>
                Cancel this payment
              </Button>
            </div>
          ) : (
            <Button href={'/quest' + (campaignId === 'astral' ? '' : '?campaign=' + campaignId)}>
              Play to unlock
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
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
type Phase = 'sealed' | 'opening' | 'done';
const SEQUENCE_MS = 2400;
export function Reveal() {
  const params = useParams<{ id: string }>(),
    { data, act, busy } = useLoop(),
    [allocation, setAllocation] = useState<Allocation | null>(null),
    [phase, setPhase] = useState<Phase>('sealed');
  const search = useSearchParams(),
    autoOpen = search.get('open') === '1',
    autoStarted = useRef(false),
    sealedHere = !!data?.collection.find((a) => a.id === params.id && !a.revealed);
  useEffect(() => {
    // Arriving from "Open my box" after payment starts the sequence straight away.
    if (!autoOpen || autoStarted.current || !sealedHere) return;
    autoStarted.current = true;
    act<Allocation>({ action: 'reveal', allocationId: params.id }).then((a) => {
      if (a) {
        setAllocation(a);
        setPhase('opening');
      }
    });
  }, [autoOpen, sealedHere, params.id, act]);
  useEffect(() => {
    if (phase !== 'opening') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setPhase('done'), reduced ? 0 : SEQUENCE_MS);
    return () => clearTimeout(timer);
  }, [phase]);
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
  // Revisiting an already-opened box shows the final frame immediately.
  const shown: Phase = phase === 'sealed' && existing.revealed && allocation === null ? 'done' : phase;
  const ch = kinOf(data, allocation?.character_id || existing.character_id);
  const boxCampaign = data.campaigns.find((c) => c.id === existing.campaign_id);
  const duplicate = data.collection.filter((a) => a.character_id === ch?.id).length > 1;
  const tier = ch?.rarity.toLowerCase() ?? 'common';
  const open = async () => {
    const a = await act<Allocation>({ action: 'reveal', allocationId: params.id });
    if (a) {
      setAllocation(a);
      setPhase('opening');
    }
  };
  return (
    <section className={'wrap reveal is-' + shown + ' tier-' + tier}>
      <Link className="back-link" href="/collection">
        <ArrowLeft size={18} aria-hidden="true" /> My collection
      </Link>
      <p className="reveal-kicker">
        {existing.position != null
          ? `Box ${existing.position + 1} of ${boxCampaign?.capacity ?? data.campaign.capacity}`
          : shown === 'done'
            ? 'Your Astral Kin'
            : 'One sealed box, already allocated to you'}
      </p>
      <div className="reveal-stage">
        <div className="burst" aria-hidden="true" />
        {ch && shown !== 'sealed' && (
          <KinArt id={ch.id} name={ch.name} color={ch.color} className="reveal-kin" />
        )}
        <div className="halves" aria-hidden="true">
          <div className="half l">
            <BoxArt />
          </div>
          <div className="half r">
            <BoxArt />
          </div>
        </div>
        {shown === 'sealed' && <span className="visually-hidden">A sealed Astral Kin box</span>}
      </div>
      <div className="reveal-copy" aria-live="polite">
        {shown === 'done' && ch ? (
          <>
            <Tier rarity={ch.rarity} />
            <h1>{ch.name}</h1>
            <p>{ch.description}</p>
            {duplicate && (
              <div className="dup">
                You have a duplicate.{' '}
                <b>Swap it for another {ch.rarity.toLowerCase()}.</b>
              </div>
            )}
            <div className="reveal-actions">
              <Button href={'/trades?allocation=' + params.id}>
                <Repeat2 size={20} aria-hidden="true" /> Find a trade
              </Button>
              <Button href="/collection" variant="ghost">
                Keep my kin
              </Button>
              <Button
                variant="quiet"
                onClick={() => downloadCard(ch.name, ch.rarity)}
              >
                <Download size={18} aria-hidden="true" /> Save card
              </Button>
            </div>
          </>
        ) : shown === 'opening' ? (
          <h1 className="reveal-wait">Opening…</h1>
        ) : (
          <>
            <h1>Your box is sealed.</h1>
            <p>The character inside was fixed when you paid. Opening it never changes it.</p>
            <div className="reveal-actions">
              <Button onClick={open} disabled={busy}>
                Open my box
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
export function downloadCard(name: string, rarity: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const display = "'Unbounded Variable', system-ui, sans-serif",
    body = "'Figtree Variable', system-ui, sans-serif";
  ctx.fillStyle = '#17123A';
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.strokeStyle = 'rgba(238,235,251,0.18)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(540, 820, 260 + i * 65, 320 + i * 65, -0.25, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFD84D';
  ctx.font = '700 34px ' + body;
  ctx.fillText('Astral Kin by LoopBox', 540, 210);
  ctx.font = '800 170px ' + display;
  ctx.fillText('?', 540, 900);
  ctx.fillStyle = '#EEEBFB';
  ctx.font = '800 72px ' + display;
  ctx.fillText(name, 540, 1270);
  ctx.fillStyle = '#B7B0E0';
  ctx.font = '600 34px ' + body;
  ctx.fillText(rarity.charAt(0) + rarity.slice(1).toLowerCase() + ' tier, series 01', 540, 1360);
  ctx.fillStyle = '#EEEBFB';
  ctx.font = '500 38px ' + body;
  ctx.fillText('A little mystery, made to order.', 540, 1580);
  ctx.fillStyle = '#B7B0E0';
  ctx.font = '500 28px ' + body;
  ctx.fillText('Digital collectible card from a hackathon demo', 540, 1770);
  const link = document.createElement('a');
  link.download = 'loopbox-my-astral-kin.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}
