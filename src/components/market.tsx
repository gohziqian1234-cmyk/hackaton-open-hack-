'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ListChecks,
  MessageCircleWarning,
  Search,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { api, useLoop } from './provider';
import { Loading } from './shell';
import { useJson } from './use-json';
import { CharacterTile } from './character-image';
import { sgd } from '../lib/catalog';
import { Button, Card, Empty, ErrorNote, Tier } from './ui';

export type MarketCard = {
  id: string;
  title: string;
  theme: string;
  price_cents: number;
  status: string;
  seller: string;
  trust: number;
  left: number;
  declared: number;
  characters: number;
  rares: number;
  fulfilment: 'SHIP' | 'MEETUP' | 'BOTH';
  verified: number;
  photo: string | null;
  colors: string | null;
  names: string | null;
};
export type ListingView = {
  listing: {
    id: string;
    title: string;
    theme: string;
    description: string;
    price_cents: number;
    fulfilment: 'SHIP' | 'MEETUP' | 'BOTH';
    status: string;
    seller: string;
    trust: number;
    verified: number;
    isMine: boolean;
  };
  characters: {
    id: string;
    name: string;
    rarity: string;
    color: string;
    declared: number;
    remaining: number;
  }[];
  photos: string[];
};
export const fulfilmentLabel = {
  SHIP: 'Posted to you',
  MEETUP: 'Meet-up hand-over',
  BOTH: 'Post or meet-up',
};
/** Demo policy (assumption, founder to confirm): sellers hand over within this many days of payment. */
export const HANDOVER_DAYS = 3;
export const shipLine = (f: 'SHIP' | 'MEETUP' | 'BOTH') =>
  (f === 'MEETUP'
    ? 'Meet-up within '
    : f === 'BOTH'
      ? 'Ships or meet-up within '
      : 'Ships within ') +
  HANDOVER_DAYS +
  ' days';

/** Seller photo from the upload route, or neutral character tiles when there is none. */
export function ListingArt({
  photo,
  colors,
  names,
  title,
}: {
  photo: string | null;
  colors: string | null;
  names?: string | null;
  title: string;
}) {
  // Served by /api/uploads with nosniff and the type recorded at upload; next/image would re-host it.
  if (photo)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="listing-photo"
        src={'/api/uploads/' + photo}
        alt={'Photo of ' + title}
        loading="lazy"
      />
    );
  const palette = (colors ?? '').split(',').filter(Boolean).slice(0, 4);
  const labels = (names ?? '').split('|');
  return (
    <div className="listing-photo listing-tiles" aria-hidden="true">
      {palette.map((c, i) => (
        <CharacterTile key={i} name={labels[i] || title} color={c} origin={title} />
      ))}
    </div>
  );
}
export function TrustChip({ seller, trust }: { seller: string; trust: number }) {
  return (
    <span className={'trust' + (trust < 50 ? ' trust-low' : '')}>
      <ShieldCheck size={16} aria-hidden="true" /> {seller} · trust {trust}
    </span>
  );
}
/** Seller identity row: initial, name, trust score, verified mark. */
export function SellerRow({
  seller,
  trust,
  verified,
}: {
  seller: string;
  trust: number;
  verified: boolean;
}) {
  return (
    <span className="seller-row">
      <b className="seller-avatar" aria-hidden="true">
        {seller.slice(0, 1).toUpperCase()}
      </b>
      <span className="seller-name">{seller}</span>
      <span className={'trust-badge' + (trust < 50 ? ' low' : '')}>Trust {trust}</span>
      {verified && (
        <span className="verified">
          <BadgeCheck size={16} aria-hidden="true" /> Verified
        </span>
      )}
    </span>
  );
}

const SORTS = [
  { id: 'new', label: 'Newest' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'stock', label: 'Most stock left' },
  { id: 'trust', label: 'Top-rated sellers' },
] as const;
type Filters = { q: string; theme: string; min: string; max: string; rarity: string; sort: string };
const EMPTY: Filters = { q: '', theme: '', min: '', max: '', rarity: '', sort: '' };

function ListingCard({ l }: { l: MarketCard }) {
  const soldOut = l.status === 'SOLD_OUT' || l.left === 0;
  const pct = l.declared ? Math.round((l.left / l.declared) * 100) : 0;
  return (
    <li>
      <Link href={'/market/' + l.id} className="listing-card-v2">
        <div className="lc-media">
          <ListingArt photo={l.photo} colors={l.colors} names={l.names} title={l.title} />
          <span className="lc-theme">{l.theme}</span>
        </div>
        <div className="lc-body">
          <h2 className="lc-title">{l.title}</h2>
          <p className="lc-price tabular">
            {sgd(l.price_cents)} <small>a box</small>
          </p>
          <div className="lc-stock">
            <span className="lc-bar" aria-hidden="true">
              <i style={{ width: pct + '%' }} />
            </span>
            <span className="tabular">
              {soldOut ? 'Sold out' : `${l.left} of ${l.declared} left`}
            </span>
          </div>
          <p className="lc-odds">
            {l.characters} characters · {l.rares} {l.rares === 1 ? 'rare' : 'rares'}
            <span aria-hidden="true"> · </span>
            <span className="visually-hidden">. </span>
            {shipLine(l.fulfilment)}
          </p>
          <SellerRow seller={l.seller} trust={l.trust} verified={!!l.verified} />
        </div>
      </Link>
    </li>
  );
}

export function MarketBrowse() {
  const router = useRouter(),
    search = useSearchParams();
  const initial: Filters = {
    q: search.get('q') ?? '',
    theme: search.get('theme') ?? '',
    min: search.get('min') ?? '',
    max: search.get('max') ?? '',
    rarity: search.get('rarity') ?? '',
    sort: search.get('sort') ?? '',
  };
  const [q, setQ] = useState(initial.q),
    [filters, setFiltersState] = useState<Filters>(initial);
  const setFilters = (next: Filters) => {
    setFiltersState(next);
    // Keep the URL shareable: every filter lives in the query string.
    const url = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) url.set(k, v);
    router.replace('/market' + (url.size ? '?' + url.toString() : ''), { scroll: false });
  };
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.theme) params.set('theme', filters.theme);
  if (filters.min) params.set('min', String(Math.round(Number(filters.min) * 100)));
  if (filters.max) params.set('max', String(Math.round(Number(filters.max) * 100)));
  if (filters.rarity) params.set('rarity', filters.rarity);
  if (filters.sort) params.set('sort', filters.sort);
  const { data, failed, reload } = useJson<{ listings: MarketCard[]; themes: string[] }>(
    '/api/market?' + params.toString(),
  );
  const filtered = Object.entries(filters).some(([k, v]) => k !== 'sort' && !!v);
  return (
    <section className="wrap market market-v2">
      <div className="mk-head">
        <div>
          <h1>Marketplace</h1>
          <p className="lead">Independent blind-box series from verified sellers.</p>
        </div>
        <Link className="text-link" href="/sell">
          Sell on LoopBox <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
      <ul className="trust-strip" aria-label="Buyer protection">
        <li>
          <ShieldCheck size={22} aria-hidden="true" /> Payment held until you confirm delivery
        </li>
        <li>
          <ListChecks size={22} aria-hidden="true" /> Full stock shown before you buy
        </li>
        <li>
          <BadgeCheck size={22} aria-hidden="true" /> Verified sellers with trust scores
        </li>
      </ul>
      <form
        className="mk-toolbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...filters, q: q.trim() });
        }}
      >
        <label className="mk-search">
          Search titles
          <span className="inline-field">
            <input name="q" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit" variant="ghost" aria-label="Search">
              <Search size={18} aria-hidden="true" />
            </Button>
          </span>
        </label>
        <label>
          Theme
          <select
            name="theme"
            value={filters.theme}
            onChange={(e) => setFilters({ ...filters, theme: e.target.value })}
          >
            <option value="">Any theme</option>
            {data?.themes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rarity
          <select
            name="rarity"
            value={filters.rarity}
            onChange={(e) => setFilters({ ...filters, rarity: e.target.value })}
          >
            <option value="">Any rarity</option>
            <option value="COMMON">Has commons left</option>
            <option value="RARE">Has rares left</option>
            <option value="SECRET">Has secrets left</option>
          </select>
        </label>
        <label className="mk-price">
          From S$
          <input
            name="min"
            type="number"
            min="0"
            max="1000"
            step="1"
            inputMode="decimal"
            value={filters.min}
            onChange={(e) => setFilters({ ...filters, min: e.target.value })}
          />
        </label>
        <label className="mk-price">
          To S$
          <input
            name="max"
            type="number"
            min="0"
            max="1000"
            step="1"
            inputMode="decimal"
            value={filters.max}
            onChange={(e) => setFilters({ ...filters, max: e.target.value })}
          />
        </label>
        <label>
          Sort
          <select
            name="sort"
            value={filters.sort || 'new'}
            onChange={(e) =>
              setFilters({ ...filters, sort: e.target.value === 'new' ? '' : e.target.value })
            }
          >
            {SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </form>
      {data && (
        <p className="mk-count tabular" role="status">
          {data.listings.length} {data.listings.length === 1 ? 'series' : 'series'}
        </p>
      )}
      {failed ? (
        <ErrorNote title="The marketplace didn’t load." onRetry={reload}>
          {failed}
        </ErrorNote>
      ) : !data ? (
        <Loading />
      ) : data.listings.length === 0 ? (
        <Empty
          title={filtered ? 'Nothing matches those filters' : 'No listings yet'}
          action={
            filtered ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setQ('');
                  setFilters({ ...EMPTY, sort: filters.sort });
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button href="/sell/new">List your series</Button>
            )
          }
        >
          {filtered
            ? 'Try a wider price range or another theme.'
            : 'Be the first creator to list a series.'}
        </Empty>
      ) : (
        <ul className="mk-grid">
          {data.listings.map((l) => (
            <ListingCard key={l.id} l={l} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ListingPage() {
  const { id } = useParams<{ id: string }>(),
    router = useRouter(),
    search = useSearchParams(),
    { data: snapshot, act, busy } = useLoop(),
    [quantity, setQuantity] = useState(1),
    [age, setAge] = useState(false),
    [paying, setPaying] = useState(false),
    { data, failed, code, reload } = useJson<ListingView>(
      '/api/market?id=' + encodeURIComponent(id),
    );
  if (code === 'NOT_FOUND')
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="This listing isn’t available."
          action={<Button href="/market">Back to the marketplace</Button>}
        >
          It may have been paused by its seller, or the link is wrong.
        </Empty>
      </section>
    );
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="The listing didn’t load." onRetry={reload}>
          {failed}
        </ErrorNote>
      </section>
    );
  if (!data || !snapshot) return <Loading />;
  const { listing, characters, photos } = data;
  const total = characters.reduce((n, c) => n + c.remaining, 0);
  const max = Math.min(10, total);
  const user = snapshot.user;
  const buy = async () => {
    setPaying(true);
    try {
      const r = await act<{ url: string; orderId: string } | { simulated: true; orderId: string }>({
        action: 'buyListing',
        listingId: listing.id,
        quantity,
        ageConfirmed: true,
      });
      if (!r) return;
      if ('url' in r) {
        window.location.assign(r.url);
        return;
      }
      await api({ orderId: r.orderId, kind: 'C2C' }, '/api/stripe/simulate');
      router.push('/orders/' + r.orderId + '?reveal=1');
    } catch (e) {
      // The order stays pending; the order page offers the next step.
      void e;
      reload();
    } finally {
      setPaying(false);
    }
  };
  return (
    <section className="wrap listing-page">
      <Link className="back-link" href="/market">
        <ArrowLeft size={18} aria-hidden="true" /> Marketplace
      </Link>
      {search.get('cancelled') === '1' && (
        <p className="notice" role="status">
          Payment cancelled. Your boxes go back into stock when the payment page expires.
        </p>
      )}
      <div className="listing-layout">
        <div className="listing-gallery">
          {photos.length ? (
            photos.map((p) => <ListingArt key={p} photo={p} colors={null} title={listing.title} />)
          ) : (
            <ListingArt
              photo={null}
              colors={characters.map((c) => c.color).join(',')}
              names={characters.map((c) => c.name).join('|')}
              title={listing.title}
            />
          )}
        </div>
        <div className="listing-main stack">
          <span className="listing-theme">{listing.theme}</span>
          <h1>{listing.title}</h1>
          <SellerRow seller={listing.seller} trust={listing.trust} verified={!!listing.verified} />
          <p className="listing-price tabular">
            {sgd(listing.price_cents)} <small>a box</small>
          </p>
          {listing.description && <p className="lead">{listing.description}</p>}
          <ul className="protection">
            <li>
              <ShieldCheck size={20} aria-hidden="true" />
              <span>
                <b>Buyer protection.</b> Your payment is held by LoopBox until you confirm you
                received what was drawn.
              </span>
            </li>
            <li>
              <Truck size={20} aria-hidden="true" />
              <span>
                <b>{fulfilmentLabel[listing.fulfilment]}.</b> {shipLine(listing.fulfilment)} of
                payment (demo policy).
              </span>
            </li>
            <li>
              <MessageCircleWarning size={20} aria-hidden="true" />
              <span>
                <b>Disputes and returns.</b> Wrong, missing or never arrived? Report it from your
                order before you confirm receipt; we review it and refund upheld reports. Blind
                boxes can’t be returned for change of mind.
              </span>
            </li>
          </ul>
          <Card className="stack">
            <h2 className="h3">What’s inside: stock and odds</h2>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Stock and odds table"
            >
              <table className="data-table odds-table">
                <caption className="visually-hidden">
                  Remaining stock per character and the chance of drawing it
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Character</th>
                    <th scope="col">Rarity</th>
                    <th scope="col" className="num">
                      Left
                    </th>
                    <th scope="col" className="num">
                      Chance now
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {characters.map((c) => (
                    <tr key={c.id}>
                      <th scope="row">
                        <span
                          className="table-dot"
                          style={{ background: c.color }}
                          aria-hidden="true"
                        />{' '}
                        {c.name}
                      </th>
                      <td>
                        <Tier rarity={c.rarity} />
                      </td>
                      <td className="num">
                        {c.remaining} of {c.declared}
                      </td>
                      <td className="num">
                        {total ? ((c.remaining / total) * 100).toFixed(1) + '%' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              Each box is drawn from the stock that’s left at that moment, so the chance of each
              character is its share of the remaining boxes.
            </p>
          </Card>
          {listing.isMine ? (
            <Empty
              title="This is your listing"
              action={<Button href="/sell">Open my seller dashboard</Button>}
            >
              Buyers see this page. You can’t buy from your own listing.
            </Empty>
          ) : listing.status === 'SOLD_OUT' || total === 0 ? (
            <Empty title="Sold out" action={<Button href="/market">Find another series</Button>}>
              Every box in this series has been drawn.
            </Empty>
          ) : !user ? (
            <Empty
              title="Sign in to buy"
              action={<Button href={'/login?next=/market/' + listing.id}>Sign in</Button>}
            >
              Your boxes and receipts are linked to your account.
            </Empty>
          ) : user.role !== 'COLLECTOR' ? (
            <Empty title="Collector accounts buy boxes">
              Partner and admin accounts can’t buy from the marketplace.
            </Empty>
          ) : (
            <form
              className="form buy-box"
              onSubmit={(e) => {
                e.preventDefault();
                buy();
              }}
            >
              <div className="form-row">
                <label>
                  Boxes (1–{max})
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    max={max}
                    required
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(Math.max(1, Math.min(max, Number(e.target.value) || 1)))
                    }
                  />
                </label>
                <p className="buy-total" aria-live="polite">
                  Total <b>{sgd(listing.price_cents * quantity)}</b>
                </p>
              </div>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={age}
                  onChange={(e) => setAge(e.target.checked)}
                  required
                />
                <span>I am 18 or older</span>
              </label>
              <Button type="submit" wide disabled={busy || paying || !age}>
                Buy boxes
              </Button>
              <p className="note">
                {snapshot.payment.mode === 'simulated'
                  ? 'Demo: payment is simulated. No card is charged.'
                  : 'You’ll pay on Stripe’s secure test checkout.'}
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
