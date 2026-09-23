import { Suspense } from 'react';
import { DropPage } from '../../../components/drops';
import { Loading } from '../../../components/shell';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <DropPage />
    </Suspense>
  );
}
