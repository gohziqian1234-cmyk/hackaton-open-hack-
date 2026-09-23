'use client';
import { useRouter } from 'next/navigation';
import { useLoop } from './provider';
import { Pending } from './shell';
import { Button, Card } from './ui';
const home: Record<string, string> = { COLLECTOR: '/collection', BUSINESS: '/studio', ADMIN: '/studio' };
const describe: Record<string, string> = {
  COLLECTOR: 'You are signed in as a collector.',
  BUSINESS: 'You are signed in to your partner studio.',
  ADMIN: 'You are signed in as the platform admin.',
};
// TODO(STUB): orders, seller verification and partner links arrive with M7/M8.
export function Account() {
  const { data, login, busy } = useLoop(),
    router = useRouter();
  if (!data) return <Pending />;
  const user = data.user;
  return (
    <section className="wrap page-pad account-page">
      <h1>{user ? user.name : 'Your account'}</h1>
      <p className="lead">{user ? describe[user.role] : 'Choose a demo identity to start.'}</p>
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
        {data.identities.length > 0 && (
          <Card>
            <h2 className="h3">Demo identities</h2>
            <p>Switch between the seeded demo accounts. Only available in demo mode.</p>
            <div className="row">
              {data.identities.map((identity) => (
                <Button
                  key={identity.id}
                  variant={user?.id === identity.id ? 'primary' : 'ghost'}
                  disabled={busy}
                  aria-pressed={user?.id === identity.id}
                  onClick={async () => {
                    await login(identity.id);
                    router.push(home[identity.role] ?? '/');
                  }}
                >
                  {identity.name}
                </Button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}
