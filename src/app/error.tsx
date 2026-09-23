'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="page empty">
      <p className="eyebrow">A MOMENTARY ECLIPSE</p>
      <h1>Let’s reconnect.</h1>
      <p>We couldn’t load this page. Your confirmed orders stay saved.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
