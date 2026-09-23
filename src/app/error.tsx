'use client';
import { ErrorNote } from '../components/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="wrap page-pad">
      <ErrorNote heading="h1" title="This page didn’t load." onRetry={reset}>
        Something went wrong on our side. Your confirmed orders are saved. Try again.
      </ErrorNote>
    </section>
  );
}
