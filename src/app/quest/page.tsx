'use client';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Loading } from '../../components/shell';
const Quest = dynamic(() => import('../../components/quest'), { loading: Loading });
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Quest />
    </Suspense>
  );
}
