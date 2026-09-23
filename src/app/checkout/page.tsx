import { Suspense } from 'react';
import { Checkout } from '../../components/checkout';
import { Loading } from '../../components/shell';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Checkout />
    </Suspense>
  );
}
