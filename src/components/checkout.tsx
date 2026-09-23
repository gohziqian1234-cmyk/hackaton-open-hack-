'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader, PackageOpen, X } from 'lucide-react';
import { useLoop } from './provider';
import { Pending } from './shell';
import { Button, Empty, ErrorNote, Tier } from './ui';
import { CharacterImage, ConceptBadge } from './character-image';
import { sgd } from '../lib/catalog';
import { themeFor } from '../lib/links';
import type { CharacterInfo, OrderItem, Snapshot, ThemeInfo } from '../lib/types';

/** Flat shipping shown for realism; the hackathon demo never charges it. */
export const DEMO_SHIPPING_CENTS = 350;

export const charOf = (data: Snapshot, id: string): CharacterInfo | undefined =>
  data.characters.find((c) => c.id === id);

/** Re-renders every second with the current time (reservation countdowns). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
function countdown(ms: number) {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Row = { item: OrderItem; ch: CharacterInfo; theme: ThemeInfo | null };

function ItemThumb({ row, variant = 'card' }: { row: Row; variant?: 'card' | 'thumb' }) {
  return <CharacterImage character={row.ch} theme={row.theme} variant={variant} />;
}

export function Checkout() {
  const { data, act, busy } = useLoop(),
    router = useRouter(),
    params = useSearchParams(),
    cancelled = params.get('cancelled') === '1',
    preselect = params.get('select'),
    released = useRef(false),
    now = useNow(),
    confirmRef = useRef<HTMLDialogElement>(null),
    declineRef = useRef<HTMLDialogElement>(null),
    [picked, setPicked] = useState<Record<string, boolean>>({}),
    [adult, setAdult] = useState(false),
    [understood, setUnderstood] = useState(false),
    [step, setStep] = useState<'confirm' | 'demo'>('confirm'),
    [declining, setDeclining] = useState<Row | null>(null),
    signedIn = !!data?.user;
  useEffect(() => {
    // Back from Stripe's cancel link: close the session so the figures can be paid again.
    if (!cancelled || released.current || !signedIn) return;
    released.current = true;
    act({ action: 'cancelCheckout' });
  }, [cancelled, signedIn, act]);
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    return data.items
      .filter((i) => i.state === 'opened')
      .map((item) => ({
        item,
        ch: charOf(data, item.character_id)!,
        theme: themeFor(data.themes, item.campaign_id),
      }))
      .filter((r) => !!r.ch);
  }, [data]);
  if (!data) return <Pending />;
  const payable = rows.filter((r) => !r.item.pending && r.item.reserved_until > now);
  const isPicked = (r: Row) => picked[r.item.id] ?? (preselect ? preselect === r.item.id : true);
  const selected = payable.filter(isPicked);
  const demo = selected.filter((r) => r.item.payment_mode === 'demo');
  const card = selected.filter((r) => r.item.payment_mode !== 'demo');
  const sum = (list: Row[]) => list.reduce((n, r) => n + r.item.price, 0);
  const subtotal = sum(selected);
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.theme?.slug ?? r.item.campaign_id;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const unopened = data.slots;
  const openModal = () => {
    setUnderstood(false);
    setStep('confirm');
    confirmRef.current?.showModal();
  };
  const pay = async () => {
    const result = await act<{
      basketId: string;
      url?: string;
      simulated?: boolean;
      orderIds: string[];
    }>({
      action: 'confirmItems',
      itemIds: selected.map((r) => r.item.id),
      ageConfirmed: true,
      understood: true,
    });
    if (!result) return;
    confirmRef.current?.close();
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    if (result.simulated && result.orderIds.length) {
      const paid = await act({ orderId: result.orderIds[0], kind: 'B2C' }, '/api/stripe/simulate');
      if (!paid) return;
    }
    router.push('/checkout/success?basket=' + result.basketId);
  };
  const yes = () => {
    // Concept drops pay first, in-page, with the demo payment sheet; card items follow.
    if (demo.length && step === 'confirm') setStep('demo');
    else pay();
  };
  return (
    <section className="wrap checkout-v2">
      <div className="co-head">
        <h1>Checkout</h1>
        <p className="lead">
          Confirm the figures you want made. Nothing is produced until you confirm.
        </p>
      </div>
      {cancelled && (
        <p className="notice" role="status">
          Payment cancelled. Your figures stay reserved until their timers run out.
        </p>
      )}
      {unopened.length > 0 && (
        <div className="co-slots">
          <PackageOpen size={22} aria-hidden="true" />
          <span>
            You have {unopened.length === 1 ? 'a slot' : unopened.length + ' slots'} you haven’t
            opened yet.
          </span>
          <Button href={'/open/' + unopened[0].id} variant="ghost">
            Open my box
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <Empty
          title="Nothing is waiting for checkout."
          action={<Button href="/drops">Explore the drops</Button>}
        >
          Win a slot, open your box, and the figure you pull waits here until you confirm it.
        </Empty>
      ) : (
        <div className="co-grid">
          <div className="co-items">
            {[...groups.entries()].map(([key, list]) => {
              const theme = list[0].theme;
              return (
                <section key={key} className="co-group" aria-labelledby={'g-' + key}>
                  <header className="co-group-head">
                    <h2 id={'g-' + key} className="h3">
                      {theme?.name ?? key}
                    </h2>
                    <ConceptBadge theme={theme} compact />
                  </header>
                  <ul className="co-rows">
                    {list.map((r) => {
                      const left = r.item.reserved_until - now;
                      const live = !r.item.pending && left > 0;
                      return (
                        <li key={r.item.id} className={'co-row' + (live ? '' : ' is-off')}>
                          <label className="co-pick">
                            <input
                              type="checkbox"
                              checked={live && isPicked(r)}
                              disabled={!live}
                              onChange={(e) =>
                                setPicked((p) => ({ ...p, [r.item.id]: e.target.checked }))
                              }
                            />
                            <span className="visually-hidden">Select {r.ch.name}</span>
                          </label>
                          <div className="co-img">
                            <ItemThumb row={r} />
                          </div>
                          <div className="co-info">
                            <strong className="co-name">{r.ch.name}</strong>
                            <div className="co-meta">
                              <Tier rarity={r.ch.rarity} />
                              <span className="muted">{theme?.name}</span>
                            </div>
                            <ConceptBadge theme={theme} compact />
                          </div>
                          <div className="co-side">
                            <strong className="tabular">{sgd(r.item.price)}</strong>
                            {r.item.pending ? (
                              <span className="co-timer">Payment in progress</span>
                            ) : left > 0 ? (
                              <span
                                className={'co-timer tabular' + (left < 5 * 60000 ? ' urgent' : '')}
                              >
                                Held {countdown(left)}
                              </span>
                            ) : (
                              <span className="co-timer">Reservation ended</span>
                            )}
                            {live && (
                              <button
                                type="button"
                                className="co-decline"
                                onClick={() => {
                                  setDeclining(r);
                                  declineRef.current?.showModal();
                                }}
                              >
                                Decline
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            <p className="note co-warn">
              Declining returns this figure to the pool. Your slot won’t give you a new draw.
            </p>
            {rows.some((r) => r.item.pending) && (
              <p className="note">
                A card payment is open for some figures.{' '}
                <Link
                  href={
                    '/checkout/success?basket=' +
                    (rows.find((r) => r.item.pending)?.item.basket_id ?? '')
                  }
                >
                  Check payment status
                </Link>{' '}
                or{' '}
                <button
                  type="button"
                  className="inline-link"
                  disabled={busy}
                  onClick={() => act({ action: 'cancelCheckout' })}
                >
                  cancel that payment
                </button>
                .
              </p>
            )}
          </div>
          <aside className="co-summary" aria-label="Order summary">
            <h2 className="h3">Summary</h2>
            <dl className="co-lines tabular">
              <div>
                <dt>Selected</dt>
                <dd>
                  {selected.length} {selected.length === 1 ? 'figure' : 'figures'}
                </dd>
              </div>
              {card.length > 0 && demo.length > 0 ? (
                <>
                  <div>
                    <dt>Real payment (Astral Kin)</dt>
                    <dd>{sgd(sum(card))}</dd>
                  </div>
                  <div>
                    <dt>Demo payment (concept drops)</dt>
                    <dd>{sgd(sum(demo))}</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt>Subtotal</dt>
                  <dd>{sgd(subtotal)}</dd>
                </div>
              )}
              <div>
                <dt>Shipping (demo flat rate)</dt>
                <dd>{selected.length ? sgd(DEMO_SHIPPING_CENTS) : sgd(0)}</dd>
              </div>
              <div className="co-total">
                <dt>Total</dt>
                <dd>{sgd(subtotal + (selected.length ? DEMO_SHIPPING_CENTS : 0))}</dd>
              </div>
            </dl>
            <p className="note">
              Each figure is 3D-printed after the preorder closes. Estimated to ship 3–4 weeks after
              close. Shipping is shown for realism and is not charged in this demo.
            </p>
            {card.length > 0 && (
              <p className="note">
                {data.payment.mode === 'stripe'
                  ? 'Card items are paid on Stripe’s test page (4242 4242 4242 4242).'
                  : 'Simulated payment (demo): no card details and no money.'}
              </p>
            )}
            <label className="consent">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
              <span>I am 18 or older</span>
            </label>
            <Button wide disabled={!selected.length || !adult || busy} onClick={openModal}>
              Checkout
            </Button>
          </aside>
        </div>
      )}

      <dialog ref={confirmRef} className="dialog co-dialog" aria-labelledby="co-dialog-title">
        {step === 'confirm' ? (
          <>
            <h2 id="co-dialog-title">Are you sure you want these made?</h2>
            <ul className="co-thumbs">
              {selected.map((r) => (
                <li key={r.item.id}>
                  <ItemThumb row={r} variant="thumb" />
                  <span>{r.ch.name}</span>
                </li>
              ))}
            </ul>
            <p>
              Once you confirm, we start production just for you. Made-to-order figures can’t be
              cancelled or returned for change of mind.
            </p>
            <label className="consent">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
              />
              <span>I understand these figures will be made just for me.</span>
            </label>
            <div className="dialog-actions">
              <Button disabled={!understood || busy} onClick={yes}>
                {busy ? 'Confirming…' : 'Yes, confirm & pay'}
              </Button>
              <Button variant="ghost" onClick={() => confirmRef.current?.close()}>
                Go back
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="co-dialog-title">Demo payment</h2>
            <p>This is a concept drop. No money is charged.</p>
            <dl className="co-lines tabular">
              {demo.map((r) => (
                <div key={r.item.id}>
                  <dt>{r.ch.name}</dt>
                  <dd>{sgd(r.item.price)}</dd>
                </div>
              ))}
            </dl>
            {card.length > 0 && (
              <p className="note">
                Then you’ll pay for {card.length} Astral Kin{' '}
                {card.length === 1 ? 'figure' : 'figures'} ({sgd(sum(card))}) on the card page.
              </p>
            )}
            <div className="dialog-actions">
              <Button disabled={busy} onClick={pay}>
                {busy ? 'Paying…' : 'Complete demo payment'}
              </Button>
              <Button variant="ghost" onClick={() => setStep('confirm')}>
                Go back
              </Button>
            </div>
          </>
        )}
        <button
          type="button"
          className="dialog-close icon-btn"
          aria-label="Close"
          onClick={() => confirmRef.current?.close()}
        >
          <X size={22} />
        </button>
      </dialog>

      <dialog
        ref={declineRef}
        className="dialog co-dialog small"
        aria-labelledby="decline-title"
        onClose={() => setDeclining(null)}
      >
        <h2 id="decline-title">
          Return {declining?.ch.name ?? 'this figure'} to the pool? You won’t get a new draw for
          this slot.
        </h2>
        <div className="dialog-actions">
          <Button
            disabled={busy}
            onClick={async () => {
              if (declining) await act({ action: 'declineItem', itemId: declining.item.id });
              declineRef.current?.close();
            }}
          >
            Return it
          </Button>
          <Button variant="ghost" onClick={() => declineRef.current?.close()}>
            Keep it
          </Button>
        </div>
      </dialog>
    </section>
  );
}

const POLL_MS = 1500,
  POLL_LIMIT_MS = 60000;
const STEPS = ['Confirmed', 'Printing', 'Quality check', 'Shipped'];

/** Never confirms anything itself: it waits until the server says the basket is paid. */
export function BasketSuccess({ basket }: { basket: string }) {
  const { data, refresh, act, busy } = useLoop(),
    [started, setStarted] = useState(() => Date.now()),
    [timedOut, setTimedOut] = useState(false);
  const items = (data?.items ?? []).filter((i) => i.basket_id === basket);
  const done = items.length > 0 && items.every((i) => i.state !== 'opened' || !i.pending);
  const confirmed = items.filter((i) =>
    ['confirmed', 'in_production', 'shipped'].includes(i.state),
  );
  useEffect(() => {
    if (done || timedOut) return;
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_LIMIT_MS) setTimedOut(true);
      else refresh().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [done, timedOut, started, refresh]);
  if (!data) return <Pending />;
  const pending = items.find((i) => i.pending);
  if (done && confirmed.length)
    return (
      <section className="wrap page-pad co-success">
        <span className="status-icon ok" aria-hidden="true">
          <Check size={30} />
        </span>
        <h1>Confirmed. You’re on the production list.</h1>
        <p className="lead">
          Order <strong className="tabular">LB-{basket.slice(0, 8).toUpperCase()}</strong>. We’ll
          3D-print {confirmed.length === 1 ? 'this figure' : 'these figures'} after the preorder
          closes.
        </p>
        <ul className="co-success-grid">
          {confirmed.map((i) => {
            const ch = charOf(data, i.character_id);
            const theme = themeFor(data.themes, i.campaign_id);
            return (
              ch && (
                <li key={i.id}>
                  <CharacterImage character={ch} theme={theme} variant="card" />
                  <strong>{ch.name}</strong>
                  <Tier rarity={ch.rarity} />
                  <ConceptBadge theme={theme} compact />
                </li>
              )
            );
          })}
        </ul>
        <ol className="prod-steps" aria-label="Production progress">
          {STEPS.map((s, i) => (
            <li
              key={s}
              className={i === 0 ? 'is-current' : undefined}
              aria-current={i === 0 ? 'step' : undefined}
            >
              <span className="node tabular">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="row center">
          <Button href="/collection">My collection</Button>
          {confirmed.length === 1 && confirmed[0].allocation_id ? (
            <Button href={'/trades?allocation=' + confirmed[0].allocation_id} variant="ghost">
              Find a trade
            </Button>
          ) : (
            <Button href="/drops" variant="ghost">
              Explore the drops
            </Button>
          )}
        </div>
        <p className="note">
          Changed your mind about which one you want? Swap it for another figure of the same rarity
          in the trade room before the preorder closes.
        </p>
      </section>
    );
  if (done)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="Payment not completed.">
          This payment expired or was refunded before it finished. Figures still inside their
          reservation are back on your checkout.
        </ErrorNote>
        <div className="row center">
          <Button href="/checkout">Back to checkout</Button>
        </div>
      </section>
    );
  if (timedOut)
    return (
      <section className="wrap page-pad">
        <ErrorNote
          heading="h1"
          title="Still waiting for the payment."
          retryLabel="Check again"
          onRetry={() => {
            setTimedOut(false);
            setStarted(Date.now());
          }}
        >
          Stripe hasn’t confirmed this payment yet. Nothing is lost: your figures stay held until
          the payment page expires.
          {data.payment.simulate && pending && pending.order_id === null && (
            <>
              {' '}
              <Button
                variant="quiet"
                disabled={busy}
                onClick={() =>
                  act(
                    { orderId: pendingOrder(data, pending.id) ?? '', kind: 'B2C' },
                    '/api/stripe/simulate',
                  )
                }
              >
                Simulate payment (demo)
              </Button>
            </>
          )}
        </ErrorNote>
      </section>
    );
  return (
    <section className="wrap page-pad checkout-status">
      <div className="status-card card" role="status">
        <span className="status-icon" aria-hidden="true">
          <Loader size={30} />
        </span>
        <h1>Waiting for payment…</h1>
        <p className="lead">
          We confirm your figures only after the payment is confirmed. This usually takes a few
          seconds.
        </p>
      </div>
    </section>
  );
}
/** The open card order of a pending item, from the order list in the snapshot. */
function pendingOrder(data: Snapshot, itemId: string) {
  void itemId;
  return data.orders.find((o) => o.status === 'PENDING_PAYMENT')?.id;
}

/** /checkout/success: a v2 basket, or a v1 order (legacy pay-then-open flow). */
export function SuccessRouter({ legacy }: { legacy: React.ReactNode }) {
  const basket = useSearchParams().get('basket');
  return basket && /^[0-9a-f-]{36}$/.test(basket) ? <BasketSuccess basket={basket} /> : legacy;
}
