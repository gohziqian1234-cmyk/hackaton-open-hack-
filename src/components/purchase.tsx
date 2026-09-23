'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ArrowUpRight, ArrowLeft, ShieldCheck, Repeat2, Check, Download } from 'lucide-react';
import { useLoop } from './provider';
import { Stage } from './stage';
import { BoxArt } from './art';
import { Loading } from './shell';
import { characters, money } from '../lib/catalog';
import type { Allocation } from '../lib/types';
export function Checkout() {
  const { data, act, busy } = useLoop(),
    router = useRouter(),
    [agreed, setAgreed] = useState(false);
  if (!data) return <Loading />;
  const access = data.access[0],
    c = data.campaign;
  return (
    <section className="page checkout-page">
      <div className="breadcrumb">
        <Link href="/drop">
          <ArrowLeft size={14} /> The drop
        </Link>
        <span>/</span>Your preorder
      </div>
      <div className="checkout-grid">
        <div className="checkout-art">
          <BoxArt />
          <p>ONE BOX. ONE UNEXPECTED COMPANION.</p>
        </div>
        <div>
          <p className="eyebrow">
            {access ? 'ACCESS EARNED · YOUR NEXT CHAPTER' : 'A LITTLE QUEST COMES FIRST'}
          </p>
          <h1>
            Make room
            <br />
            for mystery.
          </h1>
          <p className="subtitle">Astral Kin Mystery Blind Box</p>
          <div className="demo-notice">
            <ShieldCheck size={22} />
            <p>
              <strong>Demo checkout</strong>
              <br />
              No real payment is processed. No card details needed.
            </p>
          </div>
          <dl className="order-summary">
            <div>
              <dt>Quantity</dt>
              <dd>1 blind box</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>Simulated fulfilment</dd>
            </div>
            <div>
              <dt>Total preorder</dt>
              <dd>{money(c.price)} SGD</dd>
            </div>
          </dl>
          {access ? (
            <>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>
                  I understand this is a blind-box allocation. My character is revealed after
                  confirmation, and manufacture begins after final allocations lock.
                </span>
              </label>
              <button
                className="button primary wide"
                disabled={!agreed || busy}
                onClick={async () => {
                  const result = await act<{ allocationId: string }>({
                    action: 'preorder',
                    accessId: access.id,
                  });
                  if (result) router.push('/reveal/' + result.allocationId);
                }}
              >
                {busy ? 'Confirming your place…' : 'Confirm demo preorder'}{' '}
                <ArrowUpRight size={19} />
              </button>
              <p className="fine">
                Access expires at{' '}
                {new Date(access.expires_at).toLocaleTimeString('en-SG', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                . Capacity is checked again when you confirm.
              </p>
            </>
          ) : (
            <Link className="button primary" href="/quest">
              Play to unlock <ArrowUpRight size={19} />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
export function Reveal() {
  const params = useParams<{ id: string }>(),
    { data, act, busy } = useLoop(),
    [allocation, setAllocation] = useState<Allocation | null>(null),
    [opened, setOpened] = useState(false),
    [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(
      () => setFinished(true),
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 30 : 2900,
    );
    return () => clearTimeout(timer);
  }, [opened]);
  if (!data) return <Loading />;
  const existing = data.collection.find((a) => a.id === params.id);
  if (!existing)
    return (
      <section className="page empty">
        <h1>This box isn’t in your collection.</h1>
        <Link className="button primary" href="/collection">
          Back to my collection
        </Link>
      </section>
    );
  const ch = characters.find((c) => c.id === (allocation?.character_id || existing.character_id));
  const duplicate = data.collection.filter((a) => a.character_id === ch?.id).length > 1;
  const open = async () => {
    const a = await act<Allocation>({ action: 'reveal', allocationId: params.id });
    if (a) {
      setAllocation(a);
      setOpened(true);
    }
  };
  return (
    <section className={'reveal-page ' + (finished ? 'revealed' : '')}>
      <div className="reveal-top">
        <Link href="/collection">
          <ArrowLeft size={16} /> My collection
        </Link>
        <span>ASTRAL KIN · DIGITAL UNBOXING</span>
        <span>BOX / {params.id.slice(0, 6).toUpperCase()}</span>
      </div>
      <div className="reveal-title">
        <p className="eyebrow">
          {finished ? 'A NEW CONNECTION, FOUND' : 'A SMALL UNIVERSE, WAITING'}
        </p>
        <h1>{finished ? ch?.name : 'Some things find you.'}</h1>
        <p>
          {finished ? ch?.description : 'Your kin is already chosen. This is the moment you meet.'}
        </p>
      </div>
      <div className="reveal-stage-wrap">
        <div className="reveal-ring" />
        <Stage mode="reveal" opened={opened} character={ch?.id} />
      </div>
      <div className="reveal-actions" aria-live="polite">
        {!opened ? (
          <>
            <button className="button primary" onClick={open} disabled={busy}>
              Open my box <ArrowUpRight size={20} />
            </button>
            <span className="fine">One allocation. Yours to keep. Never rerolled.</span>
          </>
        ) : finished ? (
          <>
            <span className={'rarity ' + ch?.rarity.toLowerCase()}>{ch?.rarity} · SERIES 01</span>
            {duplicate && (
              <p className="duplicate">
                A familiar face. You have a duplicate — find a new kin in the trade room.
              </p>
            )}
            <div className="button-row">
              <Link className="button primary" href={'/trades?allocation=' + params.id}>
                <Repeat2 size={18} /> Find a trade
              </Link>
              <Link className="button secondary" href="/collection">
                <Check size={18} /> Keep my kin
              </Link>
              <button
                className="button quiet"
                onClick={() => downloadCard(ch?.name || 'Astral Kin', ch?.rarity || 'RARE')}
              >
                <Download size={17} /> Save card
              </button>
            </div>
          </>
        ) : (
          <p className="eyebrow">CONNECTING YOUR CONSTELLATION…</p>
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
