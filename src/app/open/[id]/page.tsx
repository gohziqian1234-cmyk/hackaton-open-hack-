import { Suspense } from 'react';
import { OpenSlot } from '../../../components/open-slot';
import { Loading } from '../../../components/shell';
export const metadata = { title: 'Open your box · LoopBox' };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <OpenSlot />
    </Suspense>
  );
}
