import { Suspense } from 'react';
import { Drop } from '../../components/discovery';
import { Loading } from '../../components/shell';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Drop />
    </Suspense>
  );
}
