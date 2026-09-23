import { redirect } from 'next/navigation';
/** v1 URL. `/drop?campaign=<id>` now lives at `/drops/<slug or id>`. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string | string[] }>;
}) {
  const raw = (await searchParams).campaign;
  const campaign = typeof raw === 'string' && /^[a-z0-9-]{1,64}$/.test(raw) ? raw : 'astral';
  redirect('/drops/' + (campaign === 'astral' ? 'astral-kin' : campaign));
}
