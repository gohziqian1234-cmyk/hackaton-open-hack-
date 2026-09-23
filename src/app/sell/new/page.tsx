import { Suspense } from 'react';
import { ListingEditor } from '../../../components/sell';
import { Loading } from '../../../components/shell';
export const metadata = { title: 'New listing · LoopBox' };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ListingEditor />
    </Suspense>
  );
}
