'use client';
import dynamic from 'next/dynamic';
import { Loading } from '../../components/shell';
const Quest = dynamic(() => import('../../components/quest'), { loading: Loading });
export default function Page() {
  return <Quest />;
}
