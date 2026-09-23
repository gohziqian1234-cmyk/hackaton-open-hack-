import { Suspense } from 'react';
import { Trades } from '../../components/trades';
import { Loading } from '../../components/shell';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Trades />
    </Suspense>
  );
}
