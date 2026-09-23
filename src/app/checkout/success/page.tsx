import { Suspense } from 'react';
import { SuccessRouter } from '../../../components/checkout';
import { CheckoutSuccess } from '../../../components/purchase';
import { Loading } from '../../../components/shell';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <SuccessRouter legacy={<CheckoutSuccess />} />
    </Suspense>
  );
}
