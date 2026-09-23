'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search, ShieldCheck, Store } from 'lucide-react';
import { api, useLoop } from './provider';
import { Loading } from './shell';
import { useJson } from './use-json';
import { KinArt } from './art';
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
  photo: string | null;
  colors: string | null;
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

/** Seller photo from the upload route, or the listing's character colours when there is none. */
export function ListingArt({
  photo,
  colors,
  title,
}: {
  photo: string | null;
  colors: string | null;
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
  const palette = (colors ?? '').split(',').filter(Boolean).slice(0, 3);
  return (
    <div className="listing-photo listing-kin" aria-hidden="true">
      {palette.map((c, i) => (
        <KinArt key={i} id="custom" name="" color={c} />
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

export function MarketBrowse() {
  const [q, setQ] = useState(''),
    [filters, setFilters] = useState({ q: '', theme: '', min: '', max: '', rarity: '' });
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.theme) params.set('theme', filters.theme);
  if (filters.min) params.set('min', String(Math.round(Number(filters.min) * 100)));
  if (filters.max) params.set('max', String(Math.round(Number(filters.max) * 100)));
  if (filters.rarity) params.set('rarity', filters.rarity);
  const { data, failed, reload } = useJson<{ listings: MarketCard[]; themes: string[] }>(
    '/api/market?' + params.toString(),
  );
  const filtered = Object.values(filters).some(Boolean);
  return (
    <section className="wrap market">
      <div className="page-heading">
        <div>
          <span className="live">Creator marketplace</span>
          <h1>Blind boxes, made by collectors.</h1>
          <p className="lead">
            Every listing shows its full stock before you buy. We draw each box from what’s left,
            and hold your payment until you confirm you got it.
          </p>
        </div>
        <Button href="/sell" variant="ghost">
          <Store size={18} aria-hidden="true" /> Sell your series
        </Button>
      </div>
      <form
        className="form market-filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...filters, q: q.trim() });
        }}
      >
        <label className="market-search">
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
        <label>
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
        <label>
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
      </form>
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
                  setFilters({ q: '', theme: '', min: '', max: '', rarity: '' });
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
        <ul className="drop-cards market-grid">
          {data.listings.map((l) => (
            <li key={l.id} className="card listing-card">
              <Link href={'/market/' + l.id} className="listing-link">
                <ListingArt photo={l.photo} colors={l.colors} title={l.title} />
                <span className="listing-theme">{l.theme}</span>
                <h2 className="h3">{l.title}</h2>
              </Link>
              <p className="listing-meta">
                <b>{sgd(l.price_cents)}</b> a box ·{' '}
                {l.status === 'SOLD_OUT' ? (
                  <span className="sold">Sold out</span>
                ) : (
                  `${l.left} left`
                )}
              </p>
              <TrustChip seller={l.seller} trust={l.trust} />
            </li>
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
              title={listing.title}
            />
          )}
        </div>
        <div className="listing-main stack">
          <span className="listing-theme">{listing.theme}</span>
          <h1>{listing.title}</h1>
          <TrustChip seller={listing.seller} trust={listing.trust} />
          {listing.description && <p className="lead">{listing.description}</p>}
          <p className="note">
            {fulfilmentLabel[listing.fulfilment]}. Your payment is held by LoopBox until you confirm
            you received what was drawn.
          </p>
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
