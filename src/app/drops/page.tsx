import { Suspense } from 'react';
import { DropsBrowser } from '../../components/drops';
import { Loading } from '../../components/shell';
export const metadata = { title: 'Drops · LoopBox' };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <DropsBrowser />
    </Suspense>
  );
}
