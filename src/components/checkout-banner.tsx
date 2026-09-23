'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useLoop } from './provider';

/** Shown under the home hero only when the collector has opened figures waiting for checkout. */
export function CheckoutBanner() {
  const { data } = useLoop();
  const waiting = (data?.items ?? []).filter((i) => i.state === 'opened').length;
  if (!waiting) return null;
  return (
    <Link className="checkout-banner" href="/checkout">
      <span>
        You have {waiting} {waiting === 1 ? 'figure' : 'figures'} waiting for confirmation
      </span>
      <span className="cb-cta">
        Review &amp; checkout <ArrowRight size={18} aria-hidden="true" />
      </span>
    </Link>
  );
}
