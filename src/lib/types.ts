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
export interface Snapshot {
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
  serverCheck?: { recomputedCommitment: string; orderMatches: boolean; fingerprintMatches: boolean };
}
