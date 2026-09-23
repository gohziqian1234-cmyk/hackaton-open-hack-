import { Suspense } from 'react';
import { Auth } from '../../components/auth';
import { Loading } from '../../components/shell';
export const metadata = { title: 'Sign in · LoopBox' };
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Auth />
    </Suspense>
  );
}
