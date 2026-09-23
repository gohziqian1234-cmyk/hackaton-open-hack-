'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useLoop } from './provider';
import { Loading } from './shell';
import { CharacterTile } from './character-image';
import { phaseLabel, sgd } from '../lib/catalog';
import { Button, Card, ErrorNote, Tier } from './ui';

type Kin = {
  name: string;
  rarity: 'COMMON' | 'RARE' | 'SECRET';
  units: number;
  color: string;
  description: string;
};
type Draft = {
  name: string;
  description: string;
  price: number;
  capacity: number;
  max_per_user: number;
  starts_at: number;
  ends_at: number;
  trade_ends_at: number;
  game_mode: 'run' | 'lore';
  required_score: number;
  attempts_per_day: number;
  characters: Kin[];
};
const DAY = 86400000;
const blank = (): Draft => {
  const start = Math.ceil(Date.now() / 3600000) * 3600000 + DAY;
  return {
    name: '',
    description: '',
    price: 1600,
    capacity: 30,
    max_per_user: 2,
    starts_at: start,
    ends_at: start + 7 * DAY,
    trade_ends_at: start + 10 * DAY,
    game_mode: 'lore',
    required_score: 10,
    attempts_per_day: 5,
    characters: [
      { name: '', rarity: 'COMMON', units: 12, color: '#FFB36B', description: '' },
      { name: '', rarity: 'COMMON', units: 12, color: '#6FC8FF', description: '' },
      { name: '', rarity: 'RARE', units: 6, color: '#FFD84D', description: '' },
    ],
  };
};
const toLocal = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function CampaignEditor() {
  const { id } = useParams<{ id: string }>(),
    isNew = id === 'new',
    router = useRouter(),
    { act, busy } = useLoop(),
    [draft, setDraft] = useState<Draft | null>(isNew ? blank() : null),
    [phase, setPhase] = useState('DRAFT'),
    [failed, setFailed] = useState('');
  useEffect(() => {
    if (isNew) return;
    fetch('/api/partner?campaign=' + encodeURIComponent(id), { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 404) throw new Error('This campaign doesn’t exist or isn’t yours.');
        if (!r.ok) throw new Error('The campaign didn’t load.');
        return r.json();
      })
      .then((d: { campaign: Draft & { phase: string }; characters: Kin[] }) => {
        setPhase(d.campaign.phase);
        setDraft({ ...d.campaign, characters: d.characters });
      })
      .catch((e) => setFailed(e.message));
  }, [id, isNew]);
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="Campaign editor">
          {failed}
        </ErrorNote>
      </section>
    );
  if (!draft) return <Loading />;
  const editable = phase === 'DRAFT';
  const units = draft.characters.reduce((n, c) => n + (Number(c.units) || 0), 0);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });
  const setKin = (i: number, patch: Partial<Kin>) =>
    set(
      'characters',
      draft.characters.map((c, k) => (k === i ? { ...c, ...patch } : c)),
    );
  const payload = () => ({
    ...(isNew ? {} : { campaignId: id }),
    name: draft.name,
    description: draft.description,
    price: draft.price,
    capacity: draft.capacity,
    max_per_user: draft.max_per_user,
    starts_at: draft.starts_at,
    ends_at: draft.ends_at,
    trade_ends_at: draft.trade_ends_at,
    game_mode: draft.game_mode,
    required_score: draft.required_score,
    attempts_per_day: draft.attempts_per_day,
    characters: draft.characters.map((c) => ({ ...c, units: Number(c.units) })),
  });
  const save = async () => {
    const r = await act<{ campaignId: string }>({
      action: 'saveDraftCampaign',
      campaign: payload(),
    });
    if (r && isNew) router.replace('/partner/campaign/' + r.campaignId);
    return r;
  };
  if (!editable)
    return (
      <section className="wrap console">
        <div className="page-heading">
          <div>
            <h1>{draft.name}</h1>
            <p className="lead">
              {phaseLabel(phase)}. Counts, price and capacity are locked once a campaign is
              submitted.
            </p>
          </div>
          <Button href="/partner" variant="ghost">
            Back to dashboard
          </Button>
        </div>
        <Card>
          <p>{draft.description}</p>
          <p className="note">
            {sgd(draft.price)} a box, cap {draft.capacity}, up to {draft.max_per_user} per person.
          </p>
          <ul className="editor-kin-list">
            {draft.characters.map((c) => (
              <li key={c.name}>
                <CharacterTile name={c.name} color={c.color} rarity={c.rarity} />
                <strong>{c.name}</strong>
                <Tier rarity={c.rarity} />
                <span className="note">{c.units} boxes</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    );
  return (
    <section className="wrap console editor">
      <div className="page-heading">
        <div>
          <h1>{isNew ? 'New campaign' : 'Edit draft'}</h1>
          <p className="lead">Everything can change until you submit it for review.</p>
        </div>
        <Button href="/partner" variant="ghost">
          Back to dashboard
        </Button>
      </div>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const saved = await save();
          if (!saved) return;
          if (await act({ action: 'submitCampaign', campaignId: saved.campaignId }))
            router.push('/partner');
        }}
      >
        <Card className="stack">
          <label>
            Series name
            <input
              name="seriesName"
              required
              minLength={2}
              maxLength={60}
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              name="seriesDescription"
              required
              minLength={10}
              maxLength={500}
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Price (SGD)
              <input
                name="seriesPrice"
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
              Boxes to make (cap)
              <input
                name="seriesCapacity"
                type="number"
                min="2"
                max="1000"
                required
                value={draft.capacity}
                onChange={(e) => set('capacity', Number(e.target.value))}
              />
            </label>
            <label>
              Per person
              <input
                name="seriesLimit"
                type="number"
                min="1"
                max="10"
                required
                value={draft.max_per_user}
                onChange={(e) => set('max_per_user', Number(e.target.value))}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Preorders open
              <input
                name="seriesStarts"
                type="datetime-local"
                required
                value={toLocal(draft.starts_at)}
                onChange={(e) => set('starts_at', new Date(e.target.value).getTime())}
              />
            </label>
            <label>
              Preorders close
              <input
                name="seriesEnds"
                type="datetime-local"
                required
                value={toLocal(draft.ends_at)}
                onChange={(e) => set('ends_at', new Date(e.target.value).getTime())}
              />
            </label>
            <label>
              Trading closes
              <input
                name="seriesTradeEnds"
                type="datetime-local"
                required
                value={toLocal(draft.trade_ends_at)}
                onChange={(e) => set('trade_ends_at', new Date(e.target.value).getTime())}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Game
              <select
                name="seriesGame"
                value={draft.game_mode}
                onChange={(e) => set('game_mode', e.target.value as 'run' | 'lore')}
              >
                <option value="lore">Lore challenge (untimed)</option>
                <option value="run">Fragment run (30 seconds)</option>
              </select>
            </label>
            <label>
              Stars needed (1–15)
              <input
                name="seriesScore"
                type="number"
                min="1"
                max="15"
                required
                value={draft.required_score}
                onChange={(e) => set('required_score', Number(e.target.value))}
              />
            </label>
            <label>
              Tries per day (1–20)
              <input
                name="seriesTries"
                type="number"
                min="1"
                max="20"
                required
                value={draft.attempts_per_day}
                onChange={(e) => set('attempts_per_day', Number(e.target.value))}
              />
            </label>
          </div>
        </Card>
        <Card className="stack">
          <div className="section-head">
            <h2 className="h3">Characters ({draft.characters.length} of 2–8)</h2>
            <p className={units === draft.capacity ? 'units-ok' : 'units-bad'} role="status">
              {units} of {draft.capacity} boxes assigned
              {units === draft.capacity ? '' : ' — the total must equal the cap'}
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
                    Boxes
                    <input
                      name={'kinUnits' + i}
                      type="number"
                      min="1"
                      max="1000"
                      required
                      value={c.units}
                      onChange={(e) => setKin(i, { units: Number(e.target.value) })}
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
                <label>
                  One-line description
                  <input
                    name={'kinDescription' + i}
                    maxLength={140}
                    value={c.description}
                    onChange={(e) => setKin(i, { description: e.target.value })}
                  />
                </label>
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
          {draft.characters.length < 8 && (
            <Button
              variant="ghost"
              onClick={() =>
                set('characters', [
                  ...draft.characters,
                  { name: '', rarity: 'COMMON', units: 1, color: '#8FE08A', description: '' },
                ])
              }
            >
              <Plus size={18} aria-hidden="true" /> Add a character
            </Button>
          )}
        </Card>
        <div className="row">
          <Button variant="ghost" disabled={busy} onClick={save}>
            Save draft
          </Button>
          <Button type="submit" disabled={busy || units !== draft.capacity}>
            Submit for review
          </Button>
        </div>
      </form>
    </section>
  );
}
