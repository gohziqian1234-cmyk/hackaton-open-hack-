import { Suspense } from 'react';
import { CheckoutSuccess } from '../../../components/purchase';
import { Loading } from '../../../components/shell';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <CheckoutSuccess />
    </Suspense>
  );
}
