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
  role: 'COLLECTOR' | 'BUSINESS';
}
export interface Allocation {
  id: string;
  character_id: string;
  owner_id: string;
  status: string;
  revealed: number;
  order_id: string;
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
export interface Snapshot {
  serverTime: number;
  campaign: Campaign;
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
