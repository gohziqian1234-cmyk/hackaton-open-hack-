'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './provider';

/** Loads JSON from a GET route. `url` null means "not yet" (e.g. signed out). */
export function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null),
    [failed, setFailed] = useState(''),
    [code, setCode] = useState(''),
    [version, setVersion] = useState(0);
  useEffect(() => {
    if (!url) return;
    let live = true;
    api<T>(undefined, url)
      .then((d) => {
        if (!live) return;
        setFailed('');
        setCode('');
        setData(d);
      })
      .catch((e: Error & { code?: string }) => {
        if (!live) return;
        setFailed(e.message);
        setCode(e.code ?? '');
      });
    return () => {
      live = false;
    };
  }, [url, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, failed, code, reload };
}
