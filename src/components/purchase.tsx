'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ArrowLeft, Download, Repeat2 } from 'lucide-react';
import { useLoop } from './provider';
import { BoxArt, KinArt } from './art';
import { Pending } from './shell';
import { characters, sgd } from '../lib/catalog';
import type { Allocation } from '../lib/types';
import { Button, Empty, Perforation, Tier } from './ui';
export function Checkout() {
  const { data, act, busy } = useLoop(),
    router = useRouter(),
    [agreed, setAgreed] = useState(false);
  if (!data) return <Pending />;
  const access = data.access[0],
    c = data.campaign;
  return (
    <section className="wrap checkout">
      <Link className="back-link" href="/drop">
        <ArrowLeft size={18} aria-hidden="true" /> Back to the drop
      </Link>
      <div className="checkout-grid">
        <div className="checkout-art">
          <BoxArt />
        </div>
        <div className="checkout-main">
          <h1>{access ? 'Your slot is ready.' : 'Win a slot first.'}</h1>
          <p className="lead">
            {access
              ? 'Pay for one sealed Astral Kin box. You open it straight after.'
              : 'Slots are earned by winning the free game. Play once, then come back here.'}
          </p>
          <div className="panel ticket" aria-label="Order summary">
            <div className="ticket-top">
              <div>
                <span className="ticket-label">Astral Kin mystery box</span>
                <strong className="ticket-price">{sgd(c.price)}</strong>
              </div>
              <span className="demo-flag ticket-flag">Simulated payment (demo)</span>
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
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I understand this is a blind box. I can’t choose the character, and it is made
                  after allocations lock.
                </span>
              </label>
              <Button
                wide
                disabled={!agreed || busy}
                onClick={async () => {
                  const result = await act<{ allocationId: string }>({
                    action: 'preorder',
                    accessId: access.id,
                  });
                  if (result) router.push('/reveal/' + result.allocationId);
                }}
              >
                {busy ? 'Confirming…' : 'Confirm demo preorder'}
              </Button>
              <p className="note">
                Your slot is held until{' '}
                {new Date(access.expires_at).toLocaleTimeString('en-SG', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                . We check that a box is still left when you confirm. No card details are needed in
                this demo.
              </p>
            </div>
          ) : (
            <Button href="/quest">Play to unlock</Button>
          )}
        </div>
      </div>
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
  const ch = characters.find((c) => c.id === (allocation?.character_id || existing.character_id));
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
          ? `Box ${existing.position + 1} of ${data.campaign.capacity}`
          : shown === 'done'
            ? 'Your Astral Kin'
            : 'One sealed box, already allocated to you'}
      </p>
      <div className="reveal-stage">
        <div className="burst" aria-hidden="true" />
        {ch && shown !== 'sealed' && <KinArt id={ch.id} className="reveal-kin" />}
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
