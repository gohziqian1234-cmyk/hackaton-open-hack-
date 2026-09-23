'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Snapshot } from '../lib/types';
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
  BUSINESS_ONLY: 'Open the demo studio account to use this control.',
  DEMO_DISABLED: 'Demo sign-in is disabled on this installation.',
};
export async function api<T>(data?: unknown): Promise<T> {
  const r = await fetch('/api/loopbox', {
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
  act: <T>(body: unknown) => Promise<T | undefined>;
  login: (user: 'collector' | 'business' | 'demo-0') => Promise<void>;
};
const Store = createContext<Context | null>(null);
export function Provider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loadFailed, setLoadFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const refresh = useCallback(async () => {
    setData(await api<Snapshot>());
  }, []);
  const retry = useCallback(() => {
    setLoadFailed(false);
    setAttempt((n) => n + 1);
  }, []);
  useEffect(() => {
    api<Snapshot>()
      .then(setData)
      .catch(() => setLoadFailed(true));
    const onFocus = () => {
      refresh().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh, attempt]);
  const act = useCallback(
    async <T,>(body: unknown) => {
      setBusy(true);
      setError('');
      try {
        const result = await api<T>(body);
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
  const login = async (user: 'collector' | 'business' | 'demo-0') => {
    await act({ action: 'login', user });
  };
  return (
    <Store.Provider value={{ data, loadFailed, retry, refresh, busy, error, act, login }}>
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
