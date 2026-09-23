import { Suspense } from 'react';
import { Reveal } from '../../../components/purchase';
import { Loading } from '../../../components/shell';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Reveal />
    </Suspense>
  );
}
