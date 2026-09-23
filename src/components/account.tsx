'use client';
import { useRouter } from 'next/navigation';
import { useLoop } from './provider';
import { Loading } from './shell';
import { Button, Card } from './ui';
// TODO(STUB): orders, seller verification and partner links arrive with M7/M8.
export function Account() {
  const { data, login, busy } = useLoop(),
    router = useRouter();
  if (!data) return <Loading />;
  const user = data.user;
  return (
    <section className="wrap page-pad account-page">
      <h1>{user ? user.name : 'Your account'}</h1>
      <p className="lead">
        {user
          ? user.role === 'BUSINESS'
            ? 'You are signed in to the maker studio.'
            : 'You are signed in as a collector.'
          : 'Choose a demo identity to start.'}
      </p>
      <div className="account-links">
        <Card>
          <h2 className="h3">Collector</h2>
          <p>Play the drop, open boxes and trade duplicates.</p>
          <div className="row">
            <Button href="/collection" variant="ghost">
              My collection
            </Button>
            <Button href="/trades" variant="ghost">
              Trade room
            </Button>
          </div>
        </Card>
        {data.demo && (
          <Card>
            <h2 className="h3">Demo identities</h2>
            <p>Switch between the seeded demo accounts. Only available in demo mode.</p>
            <div className="row">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  await login('collector');
                  router.push('/collection');
                }}
              >
                Alex, collector
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  await login('business');
                  router.push('/studio');
                }}
              >
                Astral Studio, maker
              </Button>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}
