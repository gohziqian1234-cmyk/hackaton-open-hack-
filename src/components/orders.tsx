'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, MessageCircle, PackageCheck, ShieldAlert } from 'lucide-react';
import { api, useLoop } from './provider';
import { Loading, Pending } from './shell';
import { useJson } from './use-json';
import { BoxArt } from './art';
import { CharacterTile } from './character-image';
import { ChatBubble, type ChatMessage } from './chat-bubble';
import { sgd } from '../lib/catalog';
import { Button, Card, Empty, ErrorNote, Tier } from './ui';

type OrderRow = {
  id: string;
  quantity: number;
  subtotal_cents: number;
  fee_cents: number;
  seller_owed_cents: number;
  status: string;
  payout_status: string;
  created_at: number;
  title: string;
  buyer: string;
  seller: string;
};
type OrderView = {
  order: OrderRow & { listing_id: string; fulfilment_note: string | null };
  role: 'BUYER' | 'SELLER' | 'ADMIN';
  listing: { title: string; fulfilment: string };
  buyer: string;
  seller: string;
  draws: { box_index: number; id: string; name: string; rarity: string; color: string }[];
  pickList: { name: string; count: number }[];
  threadId: string | null;
  report: { reason: string; details: string | null; status: string } | null;
};
export const orderStatus: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID_HELD: 'Paid · money held',
  FULFILLED: 'Handed over',
  COMPLETED: 'Completed',
  REPORTED: 'Reported',
  RESOLVED: 'Resolved',
  REFUNDED: 'Refunded',
  EXPIRED: 'Expired',
};
const reasons = {
  WRONG_ITEM: 'I got a different character',
  MISSING_ITEM: 'Something is missing',
  NOT_DELIVERED: 'Nothing arrived',
  OTHER: 'Something else',
};
const BOX_MS = 1200;

function SignIn({ next }: { next: string }) {
  return (
    <section className="wrap page-pad">
      <Empty
        heading="h1"
        title="My orders"
        action={<Button href={'/login?next=' + next}>Sign in</Button>}
      >
        Sign in to see what you bought and sold.
      </Empty>
    </section>
  );
}

export function OrdersPage() {
  const { data: snapshot } = useLoop(),
    [tab, setTab] = useState<'buying' | 'selling'>('buying');
  const { data, failed, reload } = useJson<{ buying: OrderRow[]; selling: OrderRow[] }>(
    snapshot?.user ? '/api/orders' : null,
  );
  if (!snapshot) return <Pending />;
  if (!snapshot.user) return <SignIn next="/orders" />;
  const rows = data?.[tab] ?? [];
  return (
    <section className="wrap console orders">
      <div className="page-heading">
        <div>
          <h1>My orders</h1>
          <p className="lead">Marketplace boxes you bought and sold.</p>
        </div>
        <Button href="/market" variant="ghost">
          Marketplace
        </Button>
      </div>
      <div className="segmented" role="group" aria-label="Orders">
        <button type="button" aria-pressed={tab === 'buying'} onClick={() => setTab('buying')}>
          Buying
        </button>
        <button type="button" aria-pressed={tab === 'selling'} onClick={() => setTab('selling')}>
          Selling
        </button>
      </div>
      {failed ? (
        <ErrorNote title="Your orders didn’t load." onRetry={reload}>
          {failed}
        </ErrorNote>
      ) : !data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty
          title={tab === 'buying' ? 'No boxes bought yet' : 'No sales yet'}
          action={
            tab === 'buying' ? (
              <Button href="/market">Browse the marketplace</Button>
            ) : (
              <Button href="/sell">Open my seller dashboard</Button>
            )
          }
        >
          {tab === 'buying'
            ? 'Orders appear here as soon as you buy.'
            : 'Paid orders for your listings appear here.'}
        </Empty>
      ) : (
        <ul className="order-list">
          {rows.map((o) => (
            <li key={o.id} className="card order-row">
              <div>
                <h2 className="h3">
                  <Link href={'/orders/' + o.id}>{o.title}</Link>
                </h2>
                <p className="note">
                  {o.quantity} {o.quantity === 1 ? 'box' : 'boxes'} · {sgd(o.subtotal_cents)} ·{' '}
                  {tab === 'buying' ? 'from ' + o.seller : 'to ' + o.buyer}
                </p>
              </div>
              <span className="phase-chip">{orderStatus[o.status] ?? o.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Opens each drawn box in turn (1.2 s each). "Skip" shows them all at once. */
function BoxReveal({ draws, onDone }: { draws: OrderView['draws']; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || shown >= draws.length) {
      onDone();
      return;
    }
    const t = setTimeout(() => setShown((n) => n + 1), BOX_MS);
    return () => clearTimeout(t);
  }, [shown, draws.length, onDone]);
  const current = draws[Math.min(shown, draws.length - 1)];
  return (
    <div className={'reveal quick is-opening tier-' + current.rarity.toLowerCase()} key={shown}>
      <p className="reveal-kicker">
        Box {Math.min(shown + 1, draws.length)} of {draws.length}
      </p>
      <div className="reveal-stage">
        <div className="burst" aria-hidden="true" />
        <CharacterTile name={current.name} color={current.color} rarity={current.rarity} className="reveal-kin" />
        <div className="halves" aria-hidden="true">
          <div className="half l">
            <BoxArt />
          </div>
          <div className="half r">
            <BoxArt />
          </div>
        </div>
      </div>
      <h2 className="reveal-wait" aria-live="polite">
        Opening…
      </h2>
      <Button variant="ghost" onClick={() => setShown(draws.length)}>
        Skip
      </Button>
    </div>
  );
}

export function OrderPage() {
  const { id } = useParams<{ id: string }>(),
    search = useSearchParams(),
    { data: snapshot, act, busy } = useLoop(),
    [revealing, setRevealing] = useState(search.get('reveal') === '1' || search.has('session_id')),
    [note, setNote] = useState(''),
    [reporting, setReporting] = useState(false),
    [reason, setReason] = useState<keyof typeof reasons>('WRONG_ITEM'),
    [details, setDetails] = useState(''),
    [polls, setPolls] = useState(0),
    { data, failed, code, reload } = useJson<OrderView>(
      snapshot?.user ? '/api/orders?id=' + encodeURIComponent(id) : null,
    );
  const pending = data?.order.status === 'PENDING_PAYMENT';
  // After a real Stripe payment the webhook may land a moment later: poll for up to a minute.
  useEffect(() => {
    if (!pending || polls >= 40) return;
    const t = setTimeout(() => {
      setPolls((n) => n + 1);
      reload();
    }, 1500);
    return () => clearTimeout(t);
  }, [pending, polls, reload]);
  const done = useCallback(() => setRevealing(false), []);
  if (!snapshot) return <Pending />;
  if (!snapshot.user) return <SignIn next={'/orders/' + id} />;
  if (code === 'NOT_FOUND')
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="This order isn’t yours."
          action={<Button href="/orders">My orders</Button>}
        >
          Only the buyer and the seller can open an order.
        </Empty>
      </section>
    );
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="The order didn’t load." onRetry={reload}>
          {failed}
        </ErrorNote>
      </section>
    );
  if (!data) return <Loading />;
  const { order, role, draws } = data;
  const perform = async (body: unknown) => {
    if (await act(body)) reload();
  };
  if (role === 'BUYER' && revealing && draws.length > 0)
    return <section className="wrap">{<BoxReveal draws={draws} onDone={done} />}</section>;
  return (
    <section className="wrap console order-page">
      <Link className="back-link" href="/orders">
        <ArrowLeft size={18} aria-hidden="true" /> My orders
      </Link>
      <div className="page-heading">
        <div>
          <span className="phase-chip">{orderStatus[order.status] ?? order.status}</span>
          <h1>{data.listing.title}</h1>
          <p className="lead">
            {order.quantity} {order.quantity === 1 ? 'box' : 'boxes'} ·{' '}
            {role === 'SELLER' ? 'bought by ' + data.buyer : 'sold by ' + data.seller}
          </p>
        </div>
        {data.threadId && (
          <Button href={'/orders/' + order.id + '/chat'} variant="ghost">
            <MessageCircle size={18} aria-hidden="true" /> Open chat
          </Button>
        )}
      </div>
      {pending && (
        <Card className="stack">
          <h2 className="h3">Waiting for payment</h2>
          <p>
            {polls >= 40
              ? 'We haven’t heard from the payment page yet. Unpaid orders expire after 31 minutes and the boxes go back in stock.'
              : 'Your boxes are drawn and held. They appear here as soon as the payment is confirmed.'}
          </p>
          {snapshot.payment.simulate && role === 'BUYER' && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                api({ orderId: order.id, kind: 'C2C' }, '/api/stripe/simulate').then(reload, reload)
              }
            >
              Simulate payment (demo)
            </Button>
          )}
        </Card>
      )}
      {order.status === 'EXPIRED' && (
        <Empty
          title="This order expired"
          action={<Button href={'/market/' + order.listing_id}>Back to the listing</Button>}
        >
          It wasn’t paid in time, so its boxes went back into stock. You weren’t charged.
        </Empty>
      )}
      {role !== 'SELLER' && draws.length > 0 && (
        <Card className="stack">
          <h2 className="h3">{role === 'BUYER' ? 'Your boxes' : 'Drawn boxes'}</h2>
          <ul className="drawn-grid">
            {draws.map((d) => (
              <li key={d.box_index} className="drawn">
                <CharacterTile name={d.name} color={d.color} rarity={d.rarity} />
                <span className="drawn-name">{d.name}</span>
                <Tier rarity={d.rarity} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {role !== 'BUYER' && data.pickList.length > 0 && (
        <Card className="stack pick-list">
          <h2 className="h3">Pick list</h2>
          <p className="pick-line">
            Hand over: {data.pickList.map((p) => `${p.count}× ${p.name}`).join(', ')}
          </p>
          {order.fulfilment_note && <p className="note">Your note: {order.fulfilment_note}</p>}
        </Card>
      )}
      <dl className="stats">
        <div className="stat">
          <dt>Order total</dt>
          <dd>{sgd(order.subtotal_cents)}</dd>
        </div>
        <div className="stat">
          <dt>Platform fee</dt>
          <dd>{sgd(order.fee_cents)}</dd>
        </div>
        <div className="stat">
          <dt>{role === 'BUYER' ? 'Seller receives' : 'Seller owed'}</dt>
          <dd>{sgd(order.seller_owed_cents)}</dd>
        </div>
      </dl>
      {role === 'SELLER' && order.status === 'PAID_HELD' && (
        <form
          className="form card"
          onSubmit={(e) => {
            e.preventDefault();
            perform({ action: 'fulfil', orderId: order.id, note });
          }}
        >
          <label>
            Note for the buyer (optional)
            <input
              name="fulfilNote"
              maxLength={300}
              placeholder="Tracking number or where you met"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy}>
            <PackageCheck size={18} aria-hidden="true" /> Mark as fulfilled
          </Button>
        </form>
      )}
      {role === 'BUYER' && (order.status === 'PAID_HELD' || order.status === 'FULFILLED') && (
        <Card className="stack">
          <h2 className="h3">
            {order.status === 'FULFILLED'
              ? 'The seller says it’s handed over'
              : 'When your boxes arrive'}
          </h2>
          <p>
            Confirm only once you have the characters shown above. That releases the money to the
            seller. If something is wrong, report it and we hold the money while we look.
          </p>
          {order.fulfilment_note && <p className="note">Seller’s note: {order.fulfilment_note}</p>}
          <div className="row">
            <Button
              disabled={busy}
              onClick={() => perform({ action: 'confirmReceipt', orderId: order.id })}
            >
              Confirm received as drawn
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              aria-expanded={reporting}
              onClick={() => setReporting(!reporting)}
            >
              <ShieldAlert size={18} aria-hidden="true" /> Report a problem
            </Button>
          </div>
          {reporting && (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                perform({ action: 'report', orderId: order.id, reason, details });
              }}
            >
              <label>
                What went wrong?
                <select
                  name="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as keyof typeof reasons)}
                >
                  {Object.entries(reasons).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Details
                <textarea
                  name="details"
                  maxLength={1000}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              </label>
              <Button type="submit" variant="ghost" disabled={busy}>
                Send report
              </Button>
            </form>
          )}
        </Card>
      )}
      {data.report && (
        <p className="notice" role="status">
          Report: {reasons[data.report.reason as keyof typeof reasons] ?? data.report.reason} ·{' '}
          {data.report.status === 'OPEN'
            ? 'we’re looking into it'
            : data.report.status.toLowerCase()}
        </p>
      )}
      {order.status === 'COMPLETED' && (
        <p className="notice" role="status">
          {role === 'SELLER'
            ? 'The buyer confirmed receipt. The seller share is now owed to you.'
            : 'Receipt confirmed. Thanks for buying from a creator.'}
        </p>
      )}
    </section>
  );
}

export function ChatPage() {
  const { id } = useParams<{ id: string }>(),
    { data: snapshot, act, busy } = useLoop(),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [me, setMe] = useState(''),
    [body, setBody] = useState(''),
    [chatError, setChatError] = useState(''),
    list = useRef<HTMLOListElement>(null),
    {
      data: order,
      failed,
      code,
    } = useJson<OrderView>(snapshot?.user ? '/api/orders?id=' + encodeURIComponent(id) : null);
  const thread = order?.threadId;
  const last = useRef(0);
  useEffect(() => {
    if (!thread) return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await api<{ userId: string; messages: ChatMessage[] }>(
          undefined,
          `/api/chat?thread=${encodeURIComponent(thread)}&after=${last.current}`,
        );
        if (stop) return;
        setMe(r.userId);
        setChatError('');
        if (r.messages.length) {
          last.current = r.messages[r.messages.length - 1].created_at;
          setMessages((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
        }
      } catch (e) {
        if (!stop) setChatError(e instanceof Error ? e.message : 'The chat didn’t load.');
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [thread]);
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);
  if (!snapshot) return <Pending />;
  if (!snapshot.user) return <SignIn next={'/orders/' + id + '/chat'} />;
  if (code === 'NOT_FOUND')
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="This chat isn’t yours."
          action={<Button href="/orders">My orders</Button>}
        >
          Only the buyer and the seller can read an order’s chat.
        </Empty>
      </section>
    );
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="The chat didn’t load.">
          {failed}
        </ErrorNote>
      </section>
    );
  if (!order) return <Loading />;
  if (!thread)
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="Chat opens after payment"
          action={<Button href={'/orders/' + id}>Back to the order</Button>}
        >
          Buyer and seller can message each other once the order is paid.
        </Empty>
      </section>
    );
  const other = order.role === 'SELLER' ? order.buyer : order.seller;
  return (
    <section className="wrap chat-page">
      <Link className="back-link" href={'/orders/' + id}>
        <ArrowLeft size={18} aria-hidden="true" /> {order.listing.title}
      </Link>
      <h1 className="h3">Chat with {other}</h1>
      <p className="chat-banner" role="note">
        <ShieldAlert size={18} aria-hidden="true" /> Pay only through LoopBox. Payments outside the
        app are not protected.
      </p>
      {chatError && (
        <p className="units-bad" role="alert">
          {chatError}
        </p>
      )}
      {messages.length === 0 && !chatError ? (
        <p className="note">No messages yet. Say hello and agree how to hand over.</p>
      ) : (
        <ol className="chat-list" ref={list} aria-label="Messages" aria-live="polite">
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} mine={m.sender_id === me} />
          ))}
        </ol>
      )}
      <form
        className="form chat-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const text = body.trim();
          if (!text) return;
          const sent = await act<{ id: string }>({
            action: 'sendMessage',
            threadId: thread,
            body: text,
          });
          if (!sent) return;
          setBody('');
          const r = await api<{ userId: string; messages: ChatMessage[] }>(
            undefined,
            `/api/chat?thread=${encodeURIComponent(thread)}&after=${last.current}`,
          ).catch(() => null);
          if (r?.messages.length) {
            last.current = r.messages[r.messages.length - 1].created_at;
            setMessages((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
          }
        }}
      >
        <label>
          <span className="visually-hidden">Message</span>
          <textarea
            name="message"
            required
            maxLength={1000}
            rows={2}
            placeholder="Write a message"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy || !body.trim()}>
          Send
        </Button>
      </form>
    </section>
  );
}
