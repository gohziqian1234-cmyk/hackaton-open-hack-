'use client';
import { useRouter } from 'next/navigation';
import { useLoop } from './provider';
import { Pending } from './shell';
import { Button, Card } from './ui';
const home: Record<string, string> = {
  COLLECTOR: '/collection',
  BUSINESS: '/partner',
  ADMIN: '/studio',
};
const describe: Record<string, string> = {
  COLLECTOR: 'You are signed in as a collector.',
  BUSINESS: 'You are signed in as a partner.',
  ADMIN: 'You are signed in as the platform admin.',
};
export function Account() {
  const { data, login, act, busy } = useLoop(),
    router = useRouter();
  if (!data) return <Pending />;
  const user = data.user;
  return (
    <section className="wrap page-pad account-page">
      <h1>{user ? user.name : 'Your account'}</h1>
      <p className="lead">
        {user ? describe[user.role] : 'Sign in or create an account to collect and trade.'}
      </p>
      <div className="account-links">
        {!user ? (
          <Card>
            <h2 className="h3">Your account</h2>
            <p>Use your email and password.</p>
            <div className="row">
              <Button href="/login?next=/me">Sign in</Button>
            </div>
          </Card>
        ) : (
          <Card>
            <h2 className="h3">
              {user.role === 'ADMIN' ? 'Admin' : user.role === 'BUSINESS' ? 'Partner' : 'Collector'}
            </h2>
            <p>
              {user.role === 'ADMIN'
                ? 'Publish drops, decide applications, read the audit trail.'
                : user.role === 'BUSINESS'
                  ? 'Draft campaigns, follow sales and download manifests.'
                  : 'Play drops, open boxes, trade duplicates and buy from creators.'}
            </p>
            <div className="row">
              {user.role === 'COLLECTOR' && (
                <>
                  <Button href="/collection" variant="ghost">
                    My collection
                  </Button>
                  <Button href="/trades" variant="ghost">
                    Trade room
                  </Button>
                  <Button href="/orders" variant="ghost">
                    My orders
                  </Button>
                  <Button href="/sell" variant="ghost">
                    Sell on the marketplace
                  </Button>
                  <Button href="/me/verify" variant="ghost">
                    Verification
                  </Button>
                  <Button href="/partners" variant="ghost">
                    Become a partner
                  </Button>
                </>
              )}
              {user.role === 'BUSINESS' && (
                <Button href="/partner" variant="ghost">
                  Partner dashboard
                </Button>
              )}
              {user.role === 'ADMIN' && (
                <Button href="/studio" variant="ghost">
                  Admin console
                </Button>
              )}
              <Button
                variant="quiet"
                disabled={busy}
                onClick={async () => {
                  if (await act({ action: 'signout' })) router.push('/');
                }}
              >
                Sign out
              </Button>
            </div>
          </Card>
        )}
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
