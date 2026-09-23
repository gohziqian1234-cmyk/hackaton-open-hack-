'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BadgeCheck, ImagePlus, Plus, Store, Trash2 } from 'lucide-react';
import { messageFor, useLoop } from './provider';
import { Loading, Pending } from './shell';
import { useJson } from './use-json';
import { CharacterTile } from './character-image';
import type { ListingView } from './market';
import { sgd } from '../lib/catalog';
import { Button, Card, Empty, ErrorNote, Stat } from './ui';

type SellState = {
  role: string;
  verified: boolean;
  trust: number;
  verification: {
    email: string | null;
    email_verified: number;
    phone: string | null;
    phone_verified: number;
  };
  listings: {
    id: string;
    title: string;
    status: string;
    price_cents: number;
    left: number;
    declared: number;
  }[];
  money: { held: number; owed: number; fees: number; sales: number };
};
const listingStatus: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Live',
  SOLD_OUT: 'Sold out',
  PAUSED: 'Paused',
  SUSPENDED: 'Suspended',
};

function SignInFirst({ title, next }: { title: string; next: string }) {
  return (
    <section className="wrap page-pad">
      <Empty
        heading="h1"
        title={title}
        action={<Button href={'/login?next=' + next}>Sign in</Button>}
      >
        Sign in with your collector account first.
      </Empty>
    </section>
  );
}

export function SellerHome() {
  const { data: snapshot, act, busy } = useLoop();
  const { data, failed, reload } = useJson<SellState>(snapshot?.user ? '/api/sell' : null);
  if (!snapshot) return <Pending />;
  if (!snapshot.user) return <SignInFirst title="Seller dashboard" next="/sell" />;
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="Your seller dashboard didn’t load." onRetry={reload}>
          {failed}
        </ErrorNote>
      </section>
    );
  if (!data) return <Loading />;
  if (data.role !== 'COLLECTOR')
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="Selling is for collector accounts"
          action={<Button href="/me">My account</Button>}
        >
          Partner and admin accounts launch drops instead.
        </Empty>
      </section>
    );
  const change = async (action: 'publishListing' | 'pauseListing', listingId: string) => {
    if (await act({ action, listingId })) reload();
  };
  return (
    <section className="wrap console seller">
      <div className="page-heading">
        <div>
          <h1>Seller dashboard</h1>
          <p className="lead">Your listings, what buyers owe you and what the platform keeps.</p>
        </div>
        {data.verified && (
          <Button href="/sell/new">
            <Plus size={18} aria-hidden="true" /> New listing
          </Button>
        )}
      </div>
      {!data.verified && (
        <Empty
          title="Verify to start selling"
          icon={<BadgeCheck size={26} />}
          action={<Button href="/me/verify">Verify email and phone</Button>}
        >
          Sellers confirm an email address and a phone number so buyers know who they’re dealing
          with.
        </Empty>
      )}
      <dl className="stats">
        <Stat label="Trust score" value={data.trust} />
        <Stat label="Paid sales" value={data.money.sales} />
        <Stat label="Held until receipt" value={sgd(data.money.held)} />
        <Stat label="Seller owed" value={sgd(data.money.owed)} />
        <Stat label="Platform fee" value={sgd(data.money.fees)} />
      </dl>
      <p className="note">
        We keep 8% of each order (at least S$0.50). The rest is held until the buyer confirms, then
        owed to you. Payouts are settled outside this demo.
      </p>
      {data.listings.length === 0 ? (
        data.verified && (
          <Empty
            title="No listings yet"
            icon={<Store size={26} />}
            action={<Button href="/sell/new">Create your first listing</Button>}
          >
            A listing is one blind-box series with 2 to 12 characters and the stock you have of
            each.
          </Empty>
        )
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Your listings table">
          <table className="data-table">
            <caption className="visually-hidden">Your listings</caption>
            <thead>
              <tr>
                <th scope="col">Listing</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Price
                </th>
                <th scope="col" className="num">
                  Left
                </th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.listings.map((l) => (
                <tr key={l.id}>
                  <th scope="row">
                    <Link href={'/market/' + l.id}>{l.title}</Link>
                  </th>
                  <td>
                    <span className="phase-chip">{listingStatus[l.status] ?? l.status}</span>
                  </td>
                  <td className="num">{sgd(l.price_cents)}</td>
                  <td className="num">
                    {l.left} of {l.declared}
                  </td>
                  <td className="table-actions">
                    {l.status === 'DRAFT' && (
                      <Button
                        variant="quiet"
                        href={'/sell/new?listing=' + l.id}
                        aria-label={'Edit ' + l.title}
                      >
                        Edit
                      </Button>
                    )}
                    {(l.status === 'DRAFT' || l.status === 'PAUSED') && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => change('publishListing', l.id)}
                        aria-label={'Publish ' + l.title}
                      >
                        Publish
                      </Button>
                    )}
                    {l.status === 'ACTIVE' && (
                      <Button
                        variant="quiet"
                        disabled={busy}
                        onClick={() => change('pauseListing', l.id)}
                        aria-label={'Pause ' + l.title}
                      >
                        Pause
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row">
        <Button href="/orders" variant="ghost">
          My orders
        </Button>
      </div>
    </section>
  );
}

type Kin = { name: string; rarity: 'COMMON' | 'RARE' | 'SECRET'; declared: number; color: string };
type Draft = {
  title: string;
  theme: string;
  description: string;
  price: number;
  fulfilment: 'SHIP' | 'MEETUP' | 'BOTH';
  characters: Kin[];
  photoIds: string[];
};
const blank = (): Draft => ({
  title: '',
  theme: '',
  description: '',
  price: 1200,
  fulfilment: 'MEETUP',
  characters: [
    { name: '', rarity: 'COMMON', declared: 10, color: '#FFB36B' },
    { name: '', rarity: 'COMMON', declared: 10, color: '#6FC8FF' },
    { name: '', rarity: 'RARE', declared: 2, color: '#FFD84D' },
  ],
  photoIds: [],
});

export function ListingEditor() {
  const { data: snapshot, act, busy } = useLoop(),
    router = useRouter(),
    editing = useSearchParams().get('listing'),
    [draft, setDraft] = useState<Draft | null>(editing ? null : blank()),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState(''),
    fileInput = useRef<HTMLInputElement>(null);
  const { data: existing, failed } = useJson<ListingView>(
    editing && snapshot?.user ? '/api/market?id=' + encodeURIComponent(editing) : null,
  );
  const { data: seller } = useJson<SellState>(snapshot?.user ? '/api/sell' : null);
  const loaded = useRef(false);
  useEffect(() => {
    if (!existing || loaded.current) return;
    loaded.current = true;
    const l = existing.listing;
    setDraft({
      title: l.title,
      theme: l.theme,
      description: l.description,
      price: l.price_cents,
      fulfilment: l.fulfilment,
      characters: existing.characters.map((c) => ({
        name: c.name,
        rarity: c.rarity as Kin['rarity'],
        declared: c.declared,
        color: c.color,
      })),
      photoIds: existing.photos,
    });
  }, [existing]);
  if (!snapshot) return <Pending />;
  if (!snapshot.user) return <SignInFirst title="New listing" next="/sell/new" />;
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="This draft didn’t load.">
          {failed}
        </ErrorNote>
      </section>
    );
  if (!draft || !seller) return <Loading />;
  if (!seller.verified)
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="Verify to start selling"
          icon={<BadgeCheck size={26} />}
          action={<Button href="/me/verify">Verify email and phone</Button>}
        >
          Confirm your email and phone number before you create a listing.
        </Empty>
      </section>
    );
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });
  const setKin = (i: number, patch: Partial<Kin>) =>
    set(
      'characters',
      draft.characters.map((c, k) => (k === i ? { ...c, ...patch } : c)),
    );
  const stock = draft.characters.reduce((n, c) => n + (Number(c.declared) || 0), 0);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError('');
    const added: string[] = [];
    try {
      for (const file of [...files].slice(0, 6 - draft.photoIds.length)) {
        if (file.size > 2 * 1024 * 1024) throw new Error(messageFor('REQUEST_TOO_LARGE'));
        const body = new FormData();
        body.append('photo', file);
        const r = await fetch('/api/upload', { method: 'POST', body });
        const json = await r.json();
        if (!r.ok) throw new Error(messageFor(json.error));
        added.push(json.photoId);
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : messageFor(''));
    } finally {
      setDraft((d) => (d ? { ...d, photoIds: [...d.photoIds, ...added] } : d));
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const save = () =>
    act<{ listingId: string }>({
      action: 'saveListing',
      listing: {
        ...(editing ? { listingId: editing } : {}),
        ...draft,
        characters: draft.characters.map((c) => ({ ...c, declared: Number(c.declared) })),
      },
    });
  return (
    <section className="wrap console editor">
      <div className="page-heading">
        <div>
          <h1>{editing ? 'Edit listing' : 'New listing'}</h1>
          <p className="lead">
            Declare exactly what you have. Buyers see the stock of every character.
          </p>
        </div>
        <Button href="/sell" variant="ghost">
          Back to dashboard
        </Button>
      </div>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const saved = await save();
          if (!saved) return;
          if (await act({ action: 'publishListing', listingId: saved.listingId }))
            router.push('/market/' + saved.listingId);
        }}
      >
        <Card className="stack">
          <label>
            Title
            <input
              name="title"
              required
              minLength={4}
              maxLength={80}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Theme
              <input
                name="theme"
                required
                minLength={2}
                maxLength={30}
                placeholder="Food, Animals, Space…"
                value={draft.theme}
                onChange={(e) => set('theme', e.target.value)}
              />
            </label>
            <label>
              Price per box (SGD)
              <input
                name="listingPrice"
                type="number"
                min="1"
                max="1000"
                step="0.01"
                required
                value={draft.price / 100}
                onChange={(e) => set('price', Math.round(Number(e.target.value) * 100))}
              />
            </label>
            <label>
              Hand-over
              <select
                name="fulfilment"
                value={draft.fulfilment}
                onChange={(e) => set('fulfilment', e.target.value as Draft['fulfilment'])}
              >
                <option value="MEETUP">Meet-up</option>
                <option value="SHIP">Post</option>
                <option value="BOTH">Post or meet-up</option>
              </select>
            </label>
          </div>
          <label>
            About this series
            <textarea
              name="listingDescription"
              maxLength={1000}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
        </Card>
        <Card className="stack">
          <div className="section-head">
            <h2 className="h3">Photos ({draft.photoIds.length} of 1–6)</h2>
            <p className="note">PNG, JPEG or WebP, up to 2 MB each.</p>
          </div>
          {draft.photoIds.length > 0 && (
            <ul className="photo-grid">
              {draft.photoIds.map((p, i) => (
                <li key={p}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={'/api/uploads/' + p} alt={'Listing photo ' + (i + 1)} />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={'Remove photo ' + (i + 1)}
                    onClick={() =>
                      set(
                        'photoIds',
                        draft.photoIds.filter((x) => x !== p),
                      )
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {uploadError && (
            <p className="units-bad" role="alert">
              {uploadError}
            </p>
          )}
          {draft.photoIds.length < 6 && (
            <label className="upload-drop">
              <ImagePlus size={22} aria-hidden="true" />
              <span>{uploading ? 'Uploading…' : 'Add photos'}</span>
              <input
                ref={fileInput}
                className="visually-hidden"
                name="photos"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={uploading}
                onChange={(e) => upload(e.target.files)}
              />
            </label>
          )}
        </Card>
        <Card className="stack">
          <div className="section-head">
            <h2 className="h3">Characters ({draft.characters.length} of 2–12)</h2>
            <p className="units-ok" role="status">
              {stock} boxes in stock
            </p>
          </div>
          {draft.characters.map((c, i) => (
            <fieldset key={i} className="kin-row">
              <legend>Character {i + 1}</legend>
              <CharacterTile name={c.name || 'New character'} color={c.color} rarity={c.rarity} />
              <div className="kin-fields">
                <div className="form-row">
                  <label>
                    Name
                    <input
                      name={'kinName' + i}
                      required
                      minLength={2}
                      maxLength={40}
                      value={c.name}
                      onChange={(e) => setKin(i, { name: e.target.value })}
                    />
                  </label>
                  <label>
                    Rarity
                    <select
                      name={'kinRarity' + i}
                      value={c.rarity}
                      onChange={(e) => setKin(i, { rarity: e.target.value as Kin['rarity'] })}
                    >
                      <option value="COMMON">Common</option>
                      <option value="RARE">Rare</option>
                      <option value="SECRET">Secret</option>
                    </select>
                  </label>
                  <label>
                    In stock
                    <input
                      name={'kinStock' + i}
                      type="number"
                      min="1"
                      max="500"
                      required
                      value={c.declared}
                      onChange={(e) => setKin(i, { declared: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Colour
                    <input
                      name={'kinColor' + i}
                      type="color"
                      value={c.color}
                      onChange={(e) => setKin(i, { color: e.target.value.toUpperCase() })}
                    />
                  </label>
                </div>
              </div>
              {draft.characters.length > 2 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={'Remove character ' + (i + 1)}
                  onClick={() =>
                    set(
                      'characters',
                      draft.characters.filter((_, k) => k !== i),
                    )
                  }
                >
                  <Trash2 size={18} />
                </button>
              )}
            </fieldset>
          ))}
          {draft.characters.length < 12 && (
            <Button
              variant="ghost"
              onClick={() =>
                set('characters', [
                  ...draft.characters,
                  { name: '', rarity: 'COMMON', declared: 1, color: '#8FE08A' },
                ])
              }
            >
              <Plus size={18} aria-hidden="true" /> Add a character
            </Button>
          )}
        </Card>
        <p className="note">
          By publishing you confirm you own these items and they match the photos.
        </p>
        <div className="row">
          <Button
            variant="ghost"
            disabled={busy || uploading}
            onClick={async () => {
              const saved = await save();
              if (saved) router.push('/sell');
            }}
          >
            Save draft
          </Button>
          <Button type="submit" disabled={busy || uploading || draft.photoIds.length === 0}>
            Publish listing
          </Button>
        </div>
      </form>
    </section>
  );
}

type Verification = SellState['verification'];

function OtpStep({
  channel,
  label,
  current,
  verified,
  placeholder,
  inputType,
  onDone,
}: {
  channel: 'EMAIL' | 'PHONE';
  label: string;
  current: string | null;
  verified: boolean;
  placeholder: string;
  inputType: 'email' | 'tel';
  onDone: () => void;
}) {
  const { act, busy } = useLoop(),
    [target, setTarget] = useState(current ?? ''),
    [sent, setSent] = useState(false),
    [demoCode, setDemoCode] = useState(''),
    [code, setCode] = useState(''),
    [note, setNote] = useState('');
  const lower = label.toLowerCase();
  return (
    <Card className="stack otp-step">
      <div className="section-head">
        <h2 className="h3">{label}</h2>
        {verified && (
          <span className="verified-chip">
            <BadgeCheck size={16} aria-hidden="true" /> Verified
          </span>
        )}
      </div>
      {verified && <p className="note">{current}</p>}
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await act<{ sent: true; demoCode?: string }>({
            action: 'sendOtp',
            channel,
            target,
          });
          if (!r) return;
          setSent(true);
          setDemoCode(r.demoCode ?? '');
          setNote('');
        }}
      >
        <label>
          {verified ? `Change ${lower}` : label}
          <input
            name={channel === 'EMAIL' ? 'verifyEmail' : 'verifyPhone'}
            type={inputType}
            required
            maxLength={channel === 'EMAIL' ? 254 : 20}
            placeholder={placeholder}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <Button type="submit" variant="ghost" disabled={busy} aria-label={`Send ${lower} code`}>
          Send code
        </Button>
      </form>
      {sent && (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act<{ verified: boolean; triesLeft?: number }>({
              action: 'verifyOtp',
              channel,
              code,
            });
            if (!r) return;
            if (r.verified) {
              setSent(false);
              setCode('');
              onDone();
            } else
              setNote(
                `That code is wrong. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.`,
              );
          }}
        >
          {demoCode && (
            <p className="notice demo-code" role="status">
              Demo code: <b>{demoCode}</b>
            </p>
          )}
          <label>
            6-digit code
            <input
              name={channel === 'EMAIL' ? 'emailCode' : 'phoneCode'}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          {note && (
            <p className="units-bad" role="alert">
              {note}
            </p>
          )}
          <Button type="submit" disabled={busy} aria-label={`Verify ${lower}`}>
            Verify
          </Button>
        </form>
      )}
    </Card>
  );
}

export function VerifyPage() {
  const { data: snapshot } = useLoop();
  const { data, failed, reload } = useJson<{ verification: Verification; verified: boolean }>(
    snapshot?.user ? '/api/sell' : null,
  );
  if (!snapshot) return <Pending />;
  if (!snapshot.user) return <SignInFirst title="Verification" next="/me/verify" />;
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="Your verification status didn’t load." onRetry={reload}>
          {failed}
        </ErrorNote>
      </section>
    );
  if (!data) return <Loading />;
  const v = data.verification;
  return (
    <section className="wrap page-pad verify-account">
      <span className="demo-flag">Demo verification — real SMS is future work</span>
      <h1>Verify your account</h1>
      <p className="lead">
        Sellers confirm an email address and a Singapore mobile number. We send a 6-digit code to
        each; codes expire after 10 minutes.
      </p>
      {data.verified && (
        <p className="notice" role="status">
          You’re verified. <Link href="/sell">Open your seller dashboard</Link>.
        </p>
      )}
      <div className="otp-grid">
        <OtpStep
          channel="EMAIL"
          label="Email"
          current={v.email}
          verified={!!v.email_verified}
          placeholder="you@example.com"
          inputType="email"
          onDone={reload}
        />
        <OtpStep
          channel="PHONE"
          label="Phone"
          current={v.phone}
          verified={!!v.phone_verified}
          placeholder="+65 9123 4567"
          inputType="tel"
          onDone={reload}
        />
      </div>
    </section>
  );
}
