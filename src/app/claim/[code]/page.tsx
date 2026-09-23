import { Suspense } from 'react';
import { ClaimPage } from '../../../components/claim';
import { Loading } from '../../../components/shell';
export const metadata = { title: 'Add a figure · LoopBox', referrer: 'no-referrer' };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <ClaimPage />
    </Suspense>
  );
}
