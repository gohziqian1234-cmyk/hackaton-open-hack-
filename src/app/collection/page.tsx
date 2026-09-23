import { Suspense } from 'react';
import { Collection } from '../../components/collection';
import { Loading } from '../../components/shell';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Collection />
    </Suspense>
  );
}
