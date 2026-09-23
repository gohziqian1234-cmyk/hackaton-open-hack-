'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Handshake, Plus } from 'lucide-react';
import { useLoop } from './provider';
import { Loading, Pending } from './shell';
import { phaseLabel, sgd } from '../lib/catalog';
import { percent } from '../domain/metrics';
import { Button, Card, Empty, ErrorNote, Stat } from './ui';

type PartnerState = {
  user: { id: string; role: string };
  application: {
    id: string;
    status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED';
    org_name: string;
    type: string;
    admin_note: string | null;
  } | null;
  dashboard: Dashboard | null;
};
type Dashboard = {
  partner: { id: string; name: string; type: string; role: string };
  campaigns: {
    id: string;
    name: string;
    phase: string;
    price: number;
    capacity: number;
    plays: number;
    wins: number;
    winRate: number;
    paid: number;
    sellThrough: number;
    trades: number;
    revenue: number;
    partnerShare: number;
    revenue_share_bps: number;
    hasPool: boolean;
  }[];
};

/** Loads /api/partner. Anonymous visitors get null state (no error). */
function usePartnerState(enabled: boolean) {
  const [state, setState] = useState<PartnerState | null>(null),
    [failed, setFailed] = useState(''),
    [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    fetch('/api/partner', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Partner details didn’t load.');
        return r.json();
      })
      .then((s: PartnerState) => {
        setFailed('');
        setState(s);
      })
      .catch((e) => setFailed(e.message));
  }, [enabled, version]);
  return { state, failed, reload: useCallback(() => setVersion((v) => v + 1), []) };
}

const steps = [
  { title: 'Apply', copy: 'Tell us who you are and show you own the characters.' },
  { title: 'Draft', copy: 'Set price, cap, dates, the game and your 2 to 8 characters.' },
  { title: 'We publish', copy: 'We check it, shuffle every box and publish the fingerprint.' },
  { title: 'Make what sold', copy: 'Download the manifest and manufacture only paid boxes.' },
];

export function PartnersLanding() {
  const { data } = useLoop();
  const signedIn = !!data?.user;
  const { state, failed, reload } = usePartnerState(signedIn);
  if (!data) return <Pending />;
  return (
    <div className="wrap partners">
      <section className="partners-hero">
        <span className="live">For brands and creator collectives</span>
        <h1>Sell your series before you make it.</h1>
        <p className="lead">
          Launch a limited blind-box drop to people who already paid. You see real demand, we run
          the game, the fair draw and the trade window, and you manufacture only what sold.
        </p>
      </section>
      <div className="partner-types">
        <Card>
          <h2 className="h3">Brand collaborator</h2>
          <p>You own an existing brand or licensed characters and want a low-risk limited run.</p>
        </Card>
        <Card>
          <h2 className="h3">Creator collective</h2>
          <p>A group of independent artists pooling designs into one series, without stock risk.</p>
        </Card>
      </div>
      <ol className="steps partner-steps">
        {steps.map((s) => (
          <li className="step" key={s.title}>
            <h3>{s.title}</h3>
            <p>{s.copy}</p>
          </li>
        ))}
      </ol>
      <Card className="terms-card">
        <h2 className="h3">Revenue share</h2>
        <p>
          You receive 30% of paid orders for your drop — draft terms, set with each partner.
          Payments run through LoopBox; payouts are settled outside this demo.
        </p>
      </Card>
      <section className="apply" aria-labelledby="apply-heading">
        <h2 id="apply-heading">Apply to launch a drop</h2>
        {!signedIn ? (
          <Empty
            title="Sign in to apply"
            icon={<Handshake size={26} />}
            action={<Button href="/login?next=/partners">Sign in or create an account</Button>}
          >
            Your application is linked to your account so you can follow its status.
          </Empty>
        ) : failed ? (
          <ErrorNote title="We couldn’t load your application." onRetry={reload}>
            {failed}
          </ErrorNote>
        ) : !state ? (
          <Loading />
        ) : state.dashboard ? (
          <Empty
            title={`You’re a partner: ${state.dashboard.partner.name}`}
            action={<Button href="/partner">Open the partner dashboard</Button>}
          >
            Draft a campaign and submit it for review.
          </Empty>
        ) : state.user.role === 'ADMIN' ? (
          <Empty
            title="Admins decide applications"
            action={<Button href="/studio">Open the admin console</Button>}
          >
            Applications appear in the admin console.
          </Empty>
        ) : state.application?.status === 'SUBMITTED' ? (
          <Empty title="Application received">
            {state.application.org_name}’s application is waiting for review. We’ll show the
            decision here.
          </Empty>
        ) : state.application?.status === 'REJECTED' ? (
          <Empty title="Application not approved">
            {state.application.admin_note || 'This application was not approved.'}
          </Empty>
        ) : (
          <ApplicationForm note={state.application?.admin_note ?? null} onDone={reload} />
        )}
      </section>
    </div>
  );
}

function ApplicationForm({ note, onDone }: { note: string | null; onDone: () => void }) {
  const { act, busy } = useLoop(),
    [type, setType] = useState<'BRAND' | 'COLLECTIVE'>('BRAND');
  return (
    <Card>
      {note && (
        <p className="notice" role="status">
          We need more information: {note}
        </p>
      )}
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const common = {
            type,
            orgName: String(f.get('orgName')),
            contactEmail: String(f.get('contactEmail')),
            proposedSeries: String(f.get('proposedSeries')),
            ipOwnership: f.get('ipOwnership') === 'on',
            ipStatement: String(f.get('ipStatement')),
          };
          const application =
            type === 'BRAND'
              ? {
                  ...common,
                  website: String(f.get('website')),
                  proofUrl: String(f.get('proofUrl')),
                }
              : {
                  ...common,
                  membersCount: Number(f.get('membersCount')),
                  portfolioUrl: String(f.get('portfolioUrl')),
                };
          if (await act({ action: 'applyPartner', application })) onDone();
        }}
      >
        <fieldset>
          <legend>Who are you?</legend>
          <div className="segmented" role="group" aria-label="Partner type">
            <button type="button" aria-pressed={type === 'BRAND'} onClick={() => setType('BRAND')}>
              Brand collaborator
            </button>
            <button
              type="button"
              aria-pressed={type === 'COLLECTIVE'}
              onClick={() => setType('COLLECTIVE')}
            >
              Creator collective
            </button>
          </div>
        </fieldset>
        <label>
          Organisation name
          <input name="orgName" required minLength={2} maxLength={80} />
        </label>
        <label>
          Contact email
          <input name="contactEmail" type="email" required maxLength={254} />
        </label>
        {type === 'BRAND' ? (
          <div className="form-row">
            <label>
              Website
              <input name="website" type="url" required placeholder="https://" maxLength={300} />
            </label>
            <label>
              Proof of rights (link)
              <input name="proofUrl" type="url" required placeholder="https://" maxLength={300} />
            </label>
          </div>
        ) : (
          <div className="form-row">
            <label>
              Number of members
              <input name="membersCount" type="number" required min={2} max={500} />
            </label>
            <label>
              Portfolio (link)
              <input
                name="portfolioUrl"
                type="url"
                required
                placeholder="https://"
                maxLength={300}
              />
            </label>
          </div>
        )}
        <label>
          The series you want to launch
          <textarea name="proposedSeries" required minLength={10} maxLength={500} />
        </label>
        <label>
          How you own the characters
          <textarea name="ipStatement" required minLength={20} maxLength={1000} />
        </label>
        <label className="consent">
          <input name="ipOwnership" type="checkbox" required />
          <span>I confirm we own or have licensed every character in this series.</span>
        </label>
        <Button type="submit" disabled={busy}>
          Submit application
        </Button>
      </form>
    </Card>
  );
}

export function PartnerDashboard() {
  const { data } = useLoop(),
    router = useRouter();
  const signedIn = !!data?.user;
  const { state, failed, reload } = usePartnerState(signedIn);
  if (!data) return <Pending />;
  if (!signedIn)
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="Partner dashboard"
          action={<Button href="/login?next=/partner">Sign in</Button>}
        >
          Sign in with your partner account.
        </Empty>
      </section>
    );
  if (failed)
    return (
      <section className="wrap page-pad">
        <ErrorNote heading="h1" title="Partner dashboard" onRetry={reload}>
          {failed}
        </ErrorNote>
      </section>
    );
  if (!state) return <Loading />;
  if (!state.dashboard)
    return (
      <section className="wrap page-pad">
        <Empty
          heading="h1"
          title="You’re not a partner yet"
          icon={<Handshake size={26} />}
          action={<Button href="/partners">Apply to launch a drop</Button>}
        >
          {state.application
            ? `Your application is ${state.application.status.replace('_', ' ').toLowerCase()}.`
            : 'Apply first. Once approved, you can draft campaigns here.'}
        </Empty>
      </section>
    );
  const d = state.dashboard;
  return (
    <section className="wrap console partner-dashboard">
      <div className="page-heading">
        <div>
          <h1>{d.partner.name}</h1>
          <p className="lead">
            {d.partner.type === 'COLLECTIVE' ? 'Creator collective' : 'Brand collaborator'}. Your
            campaigns, demand and share.
          </p>
        </div>
        <Button onClick={() => router.push('/partner/campaign/new')}>
          <Plus size={18} aria-hidden="true" /> New campaign
        </Button>
      </div>
      {d.campaigns.length === 0 ? (
        <Empty
          title="No campaigns yet"
          action={<Button href="/partner/campaign/new">Draft your first campaign</Button>}
        >
          A campaign is one limited series: price, cap, dates and 2 to 8 characters.
        </Empty>
      ) : (
        <ul className="campaign-list">
          {d.campaigns.map((c) => (
            <li key={c.id} className="card campaign-row">
              <div className="section-head">
                <div>
                  <h2 className="h3">{c.name}</h2>
                  <p className="note">
                    {sgd(c.price)} a box, cap {c.capacity}. Share {c.revenue_share_bps / 100}% of
                    paid orders (draft terms).
                  </p>
                </div>
                <span className="phase-chip">{phaseLabel(c.phase)}</span>
              </div>
              <dl className="stats">
                <Stat label="Plays" value={c.plays} />
                <Stat label="Wins" value={c.wins} />
                <Stat label="Win rate" value={percent(c.winRate)} />
                <Stat label="Paid boxes" value={c.paid} />
                <Stat label="Sell-through" value={percent(c.sellThrough)} />
                <Stat label="Trades" value={c.trades} />
                <Stat label="Revenue" value={sgd(c.revenue)} />
                <Stat label="Your share" value={sgd(c.partnerShare)} />
              </dl>
              <div className="row">
                <Button href={'/partner/campaign/' + c.id} variant="ghost">
                  {c.phase === 'DRAFT' ? 'Edit draft' : 'View campaign'}
                </Button>
                {c.phase !== 'DRAFT' && c.phase !== 'IN_REVIEW' && (
                  <Button href={'/drop?campaign=' + c.id} variant="ghost">
                    Open the drop page
                  </Button>
                )}
                {c.hasPool && (
                  <a className="btn btn-quiet" href={'/api/manifest?campaign=' + c.id} download>
                    <Download size={18} aria-hidden="true" /> Download manifest
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
