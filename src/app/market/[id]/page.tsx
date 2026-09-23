import { Suspense } from 'react';
import { ListingPage } from '../../../components/market';
import { Loading } from '../../../components/shell';
export const metadata = { title: 'Listing · LoopBox' };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ListingPage />
    </Suspense>
  );
}
