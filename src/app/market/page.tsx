import { Suspense } from 'react';
import { MarketBrowse } from '../../components/market';
import { Loading } from '../../components/shell';
export const metadata = { title: 'Marketplace · LoopBox' };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <MarketBrowse />
    </Suspense>
  );
}
