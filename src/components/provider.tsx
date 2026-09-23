'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CharacterInfo, Snapshot } from '../lib/types';
import { characters as catalog } from '../lib/catalog';
const messages: Record<string, string> = {
  SOLD_OUT: 'The last box has been claimed. Join the waitlist for the next drop.',
  PURCHASE_LIMIT: 'You’ve reached your limit for this drop. Your collection is ready to explore.',
  ACCESS_EXPIRED: 'Your access has expired. Complete the quest again to unlock a fresh slot.',
  ACCESS_ALREADY_USED: 'This access has already been used. Your box is in your collection.',
  SIGN_IN_REQUIRED: 'Choose a demo collector to continue.',
  PREORDER_CLOSED: 'Preorders are closed for this drop.',
  TRADE_WINDOW_CLOSED: 'The trade window has closed. These allocations are now final.',
  SAME_RARITY_REQUIRED: 'Choose a different character from the same rarity tier.',
  SESSION_ALREADY_USED: 'This quest has already been submitted. Start a fresh run to try again.',
  INVALID_RUN: 'We couldn’t validate this run. Please play the full quest and try again.',
  ALLOCATION_UNAVAILABLE: 'This collectible is already reserved or locked.',
  TRY_AGAIN_SHORTLY: 'Take a short breather, then try again.',
  ATTEMPT_LIMIT: 'You have used all your tries for today. Come back after midnight, Singapore time.',
  BUSINESS_ONLY: 'Open the demo studio account to use this control.',
  DEMO_DISABLED: 'Demo sign-in is disabled on this installation.',
  AGE_CONFIRMATION_REQUIRED: 'Please confirm you are 18 or older to buy a box.',
  PAYMENTS_NOT_CONFIGURED: 'Card payments are not set up on this server yet.',
  PAYMENT_UNAVAILABLE: 'We couldn’t reach the payment page. Your slot is still held. Try again.',
  SPENDING_CAP: 'That order is above the safety limit for a single payment.',
  LIVE_KEYS_REFUSED: 'This demo only accepts Stripe test keys.',
  ALREADY_DONE: 'That payment was already processed.',
  RATE_LIMITED: 'You’re going a little fast. Wait a moment and try again.',
  INVALID_ACCESS: 'That slot belongs to someone else or has already been used.',
  FORBIDDEN: 'Your account can’t do that.',
  INVALID_STATE: 'That step isn’t possible in the campaign’s current phase.',
  VALIDATION_FAILED: 'Some details don’t add up. Check the numbers and try again.',
  NOT_FOUND: 'We couldn’t find that.',
};
export async function api<T>(data?: unknown, url = '/api/loopbox'): Promise<T> {
  const r = await fetch(url, {
    method: data ? 'POST' : 'GET',
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    cache: 'no-store',
  });
  const json = await r.json();
  if (!r.ok)
    throw new Error(
      messages[json.error] || 'We couldn’t complete that action. Refresh and try again.',
    );
  return json as T;
}
type Context = {
  data: Snapshot | null;
  loadFailed: boolean;
  retry: () => void;
  refresh: () => Promise<void>;
  busy: boolean;
  error: string;
  act: <T>(body: unknown, url?: string) => Promise<T | undefined>;
  login: (user: string) => Promise<void>;
  selectCampaign: (id: string) => void;
};
const Store = createContext<Context | null>(null);
export function Provider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loadFailed, setLoadFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    [campaignId, setCampaignId] = useState('astral'),
    selected = useRef('astral');
  // The snapshot is always for one campaign; pages pick it with useCampaign().
  const snapshotUrl = () => '/api/loopbox?campaign=' + encodeURIComponent(selected.current);
  const refresh = useCallback(async () => {
    setData(await api<Snapshot>(undefined, snapshotUrl()));
  }, []);
  const selectCampaign = useCallback((id: string) => {
    if (selected.current === id) return;
    selected.current = id;
    setCampaignId(id);
  }, []);
  const retry = useCallback(() => {
    setLoadFailed(false);
    setAttempt((n) => n + 1);
  }, []);
  useEffect(() => {
    api<Snapshot>(undefined, snapshotUrl())
      .then(setData)
      .catch(() => setLoadFailed(true));
    const onFocus = () => {
      refresh().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh, attempt, campaignId]);
  const act = useCallback(
    async <T,>(body: unknown, url?: string) => {
      setBusy(true);
      setError('');
      try {
        const result = await api<T>(body, url);
        await refresh();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please retry.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );
  const login = async (user: string) => {
    await act({ action: 'login', user });
  };
  return (
    <Store.Provider
      value={{ data, loadFailed, retry, refresh, busy, error, act, login, selectCampaign }}
    >
      {children}
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss notification" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
    </Store.Provider>
  );
}
export function useLoop() {
  const value = useContext(Store);
  if (!value) throw new Error('Missing LoopBox provider');
  return value;
}
/** Selects the campaign for this page. Returns the snapshot only once it is for that campaign. */
export function useCampaign(id: string) {
  const { data, selectCampaign } = useLoop();
  useEffect(() => selectCampaign(id), [id, selectCampaign]);
  return data && data.campaign.id === id ? data : null;
}
export type Kin = Pick<CharacterInfo, 'id' | 'name' | 'rarity' | 'description'> & {
  color: string;
  units: number;
  campaign_id: string;
};
/** Character details from the database (partner series) with the built-in catalogue as fallback. */
export function kinOf(data: Snapshot | null, id: string | undefined): Kin | undefined {
  if (!id) return undefined;
  const row = data?.characters.find((c) => c.id === id);
  const base = catalog.find((c) => c.id === id);
  if (row)
    return {
      id: row.id,
      name: row.name,
      rarity: row.rarity,
      description: row.description ?? base?.description ?? '',
      color: row.color ?? base?.color ?? '#B7B0E0',
      units: row.units,
      campaign_id: row.campaign_id,
    };
  return base ? { ...base, campaign_id: 'astral' } : undefined;
}
