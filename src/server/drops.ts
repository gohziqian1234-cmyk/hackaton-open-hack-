// v2 Drops: theme browser data on top of the campaign engine (service → partners → market).
import { randomUUID } from 'node:crypto';
import type { User, ThemeInfo, Snapshot } from '../lib/types';
import { DomainError } from './errors';
import { Market } from './market';

type ThemeRow = {
  slug: string;
  name: string;
  status: 'live' | 'coming_soon';
  payment_mode: 'stripe' | 'demo' | null;
  is_licensed_concept: number;
  sort_order: number;
  tagline: string;
  description: string;
  accent: string;
  accent_secondary: string | null;
  cover_image: string | null;
  campaign_id: string | null;
  slot_hold_minutes: number;
  reservation_minutes: number;
  closes_at: number | null;
};
type CampaignRow = {
  id: string;
  name: string;
  description: string;
  phase: string;
  price: number;
  capacity: number;
  max_per_user: number;
  starts_at: number;
  ends_at: number;
  partner: string | null;
  claimed: number;
};
/** Default accent for partner campaigns that have no theme row. */
const PARTNER_ACCENT = '#5EEAD4';

export class Drops extends Market {
  /** Boxes a campaign has given out or holds for someone (counts against its cap). */
  protected claimedSql(alias: string) {
    return `(SELECT COUNT(*) FROM orders WHERE campaign_id=${alias}.id AND status IN ('PENDING_PAYMENT','PAID','DEMO_PAID'))`;
  }
  /** Every theme card for /drops, in sort order, plus published partner campaigns without a theme. */
  themes(): ThemeInfo[] {
    const campaigns = new Map(
      this.all<CampaignRow>(
        `SELECT c.id,c.name,c.description,c.phase,c.price,c.capacity,c.max_per_user,c.starts_at,c.ends_at,p.name AS partner,${this.claimedSql('c')} AS claimed
         FROM campaigns c LEFT JOIN partners p ON p.id=c.partner_id
         WHERE c.phase NOT IN ('DRAFT','IN_REVIEW','CANCELLED') ORDER BY c.created_at,c.id`,
      ).map((c) => [c.id, c]),
    );
    const mixes = new Map<string, ThemeInfo['mix']>();
    for (const r of this.all<{ campaign_id: string; rarity: 'COMMON' | 'RARE' | 'SECRET'; n: number }>(
      'SELECT campaign_id,rarity,COUNT(*) AS n FROM characters GROUP BY campaign_id,rarity',
    )) {
      const mix = mixes.get(r.campaign_id) ?? { COMMON: 0, RARE: 0, SECRET: 0 };
      mix[r.rarity] = r.n;
      mixes.set(r.campaign_id, mix);
    }
    const empty = { COMMON: 0, RARE: 0, SECRET: 0 };
    const fromCampaign = (c: CampaignRow | undefined) => ({
      phase: c?.phase ?? null,
      price: c?.price ?? null,
      capacity: c?.capacity ?? null,
      claimed: c?.claimed ?? 0,
      max_per_user: c?.max_per_user ?? null,
      starts_at: c?.starts_at ?? null,
      mix: (c && mixes.get(c.id)) ?? empty,
      partner: c?.partner ?? null,
    });
    const themed = this.all<ThemeRow>('SELECT * FROM themes ORDER BY sort_order,slug').map(
      (t): ThemeInfo => {
        const c = t.campaign_id ? campaigns.get(t.campaign_id) : undefined;
        if (t.campaign_id) campaigns.delete(t.campaign_id);
        return {
          slug: t.slug,
          name: t.name,
          status: t.status === 'live' && c ? 'live' : 'coming_soon',
          payment_mode: t.payment_mode,
          licensed: t.is_licensed_concept === 1,
          sort_order: t.sort_order,
          tagline: t.tagline,
          description: t.description,
          accent: t.accent,
          accent_secondary: t.accent_secondary,
          cover: t.cover_image,
          campaign_id: c ? t.campaign_id : null,
          closes_at: c?.ends_at ?? t.closes_at,
          slot_hold_minutes: t.slot_hold_minutes,
          reservation_minutes: t.reservation_minutes,
          ...fromCampaign(c),
        };
      },
    );
    // Partner campaigns published through the portal appear after the seeded themes.
    const partnerDrops = [...campaigns.values()].map(
      (c, i): ThemeInfo => ({
        slug: c.id,
        name: c.name,
        status: 'live',
        payment_mode: 'stripe',
        licensed: false,
        sort_order: 1000 + i,
        tagline: c.partner ? `A drop by ${c.partner}.` : 'A partner drop.',
        description: c.description,
        accent: PARTNER_ACCENT,
        accent_secondary: null,
        cover: null,
        campaign_id: c.id,
        closes_at: c.ends_at,
        slot_hold_minutes: 15,
        reservation_minutes: 30,
        ...fromCampaign(c),
      }),
    );
    return [...themed, ...partnerDrops];
  }
  /** The theme card for a slug or a campaign id, or null. */
  theme(slugOrCampaign: string) {
    return (
      this.themes().find((t) => t.slug === slugOrCampaign || t.campaign_id === slugOrCampaign) ??
      null
    );
  }
  /** "Notify me" on a coming-soon theme. Idempotent per user and theme. */
  notifyTheme(userId: string, slug: string) {
    this.user(userId);
    const t = this.one<{ id: string; status: string }>('SELECT id,status FROM themes WHERE slug=?', slug);
    if (!t) throw new DomainError('NOT_FOUND', 404);
    if (t.status !== 'coming_soon') throw new DomainError('INVALID_STATE');
    this.run(
      'INSERT OR IGNORE INTO theme_interest (id,user_id,theme_id,created_at) VALUES (?,?,?,?)',
      randomUUID(),
      userId,
      t.id,
      this.now(),
    );
    return { ok: true };
  }
  interest(userId: string) {
    return this.all<{ slug: string }>(
      'SELECT t.slug FROM theme_interest i JOIN themes t ON t.id=i.theme_id WHERE i.user_id=? ORDER BY t.sort_order',
      userId,
    ).map((r) => r.slug);
  }
  snapshot(user: User | null, campaignId = 'astral'): Snapshot {
    const core = super.snapshot(user, campaignId);
    return {
      ...core,
      themes: this.themes(),
      interest: user ? this.interest(user.id) : [],
      items: [],
    };
  }
}
