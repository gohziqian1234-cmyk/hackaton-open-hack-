import { Suspense } from 'react';
import { OrderPage } from '../../../components/orders';
import { Loading } from '../../../components/shell';
export const metadata = { title: 'Order · LoopBox' };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <OrderPage />
    </Suspense>
  );
}
