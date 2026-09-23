import type { Phase } from './catalog';
export interface Campaign {
  id: string;
  name: string;
  description: string;
  price: number;
  capacity: number;
  max_per_user: number;
  phase: Phase;
  ends_at: number;
  trade_ends_at: number;
  starts_at: number;
  confirmed: number;
  required_score: number;
  attempts_per_day: number;
  game_mode: 'run' | 'lore';
}
export interface User {
  id: string;
  name: string;
  role: 'COLLECTOR' | 'BUSINESS' | 'ADMIN';
}
export interface Allocation {
  id: string;
  character_id: string;
  owner_id: string;
  status: string;
  revealed: number;
  order_id: string;
  campaign_id: string;
  position?: number | null;
}
export interface Access {
  id: string;
  expires_at: number;
  status: string;
}
export interface Match {
  id: string;
  a_id: string;
  b_id: string;
  a_user: string;
  b_user: string;
  a_accept: number;
  b_accept: number;
  status: string;
  offered: string;
  requested: string;
  partner: string;
}
export interface CharacterInfo {
  id: string;
  campaign_id: string;
  name: string;
  rarity: 'COMMON' | 'RARE' | 'SECRET';
  units: number;
  color: string | null;
  description: string | null;
  /** Image key inside the theme (image manifest), when the character has one. */
  slug?: string | null;
  /** Boxes of this character already drawn (opened or paid) in its drop. */
  pulled?: number;
}
/** One card on /drops: a seeded theme, or a published partner campaign without a theme row. */
export interface ThemeInfo {
  slug: string;
  name: string;
  status: 'live' | 'coming_soon';
  payment_mode: 'stripe' | 'demo' | null;
  licensed: boolean;
  sort_order: number;
  tagline: string;
  description: string;
  accent: string;
  accent_secondary: string | null;
  cover: string | null;
  campaign_id: string | null;
  phase: string | null;
  price: number | null;
  capacity: number | null;
  claimed: number;
  max_per_user: number | null;
  closes_at: number | null;
  starts_at: number | null;
  slot_hold_minutes: number;
  reservation_minutes: number;
  mix: { COMMON: number; RARE: number; SECRET: number };
  partner: string | null;
}
export interface CampaignCard {
  id: string;
  name: string;
  phase: Phase;
  price: number;
  capacity: number;
  confirmed: number;
  starts_at: number;
  ends_at: number;
  trade_ends_at: number;
  partner: string | null;
  partner_type: 'BRAND' | 'COLLECTIVE' | null;
}
export type Snapshot = CoreSnapshot & {
  themes: ThemeInfo[];
  /** Theme slugs the user asked to be notified about. */
  interest: string[];
  /** The user's opened blind boxes and what happened to them (all drops). */
  items: OrderItem[];
  /** Physical figures this user added by QR code. */
  physical: PhysicalFigure[];
  /** Won slots not opened yet, in every drop. */
  slots: { id: string; campaign_id: string; expires_at: number }[];
};
/** One opened slot: slot_won (an unused access) → opened → confirmed → in_production → shipped. */
export interface OrderItem {
  id: string;
  access_id: string;
  campaign_id: string;
  theme_slug: string | null;
  character_id: string;
  state: 'opened' | 'confirmed' | 'in_production' | 'shipped' | 'declined' | 'expired';
  opened_at: number;
  reserved_until: number;
  confirmed_at: number | null;
  payment_mode: 'stripe' | 'demo' | null;
  /** A card payment for this item is open on Stripe right now. */
  pending: boolean;
  basket_id: string | null;
  allocation_id: string | null;
  order_id: string | null;
  position: number;
  price: number;
}
export interface CoreSnapshot {
  serverTime: number;
  campaign: Campaign;
  campaigns: CampaignCard[];
  characters: CharacterInfo[];
  weights: number[];
  user: User | null;
  access: Access[];
  collection: Allocation[];
  matches: Match[];
  purchases: number;
  waitlisted: boolean;
  demo: boolean;
  attemptLimit: number;
  attemptsLeft: number;
  orders: OrderSummary[];
  payment: { mode: 'stripe' | 'simulated' | 'unavailable'; simulate: boolean };
  identities: { id: string; name: string; role: string }[];
}
export interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  detail: string;
  created_at: number;
}
export interface AdminCampaign {
  id: string;
  name: string;
  phase: string;
  capacity: number;
  price: number;
  starts_at: number;
  partner: string | null;
  paid: number;
  pending: number;
  pool: number;
}
export interface OrderSummary {
  id: string;
  campaign_id: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'DEMO_PAID' | 'EXPIRED' | 'REFUNDED';
  created_at: number;
  allocation_id: string | null;
  session_id: string | null;
  expires_at: number | null;
}
export interface Analytics {
  orders: number;
  plays: number;
  wins: number;
  winRate: number;
  players: number;
  completions: number;
  unlocks: number;
  opened: number;
  listings: number;
  trades: number;
  distribution: { id: string; name: string; rarity: string; quantity: number }[];
}
export interface Verification {
  campaign: { id: string; name: string; capacity: number };
  characters: { id: string; name: string; units: number }[];
  commitment: string;
  committedAt: number;
  revealed: boolean;
  revealedAt: number | null;
  yourPositions: number[];
  demoNote: boolean;
  sold: number;
  seed?: string;
  order?: string[];
  serverCheck?: {
    recomputedCommitment: string;
    orderMatches: boolean;
    fingerprintMatches: boolean;
  };
}
export interface PhysicalFigure {
  id: string;
  character_id: string;
  campaign_id: string;
  theme_slug: string;
  serial_no: number;
  cap: number;
  claimed_at: number;
}
