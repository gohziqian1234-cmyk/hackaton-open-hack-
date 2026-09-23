export const characters = [
  {
    id: 'nova',
    units: 21,
    name: 'Nova Scout',
    rarity: 'COMMON',
    color: '#FFB36B',
    description: 'The first light on an uncharted horizon.',
  },
  {
    id: 'moss',
    units: 21,
    name: 'Moss Oracle',
    rarity: 'COMMON',
    color: '#8FE08A',
    description: 'A quiet guardian of worlds still growing.',
  },
  {
    id: 'tide',
    units: 21,
    name: 'Tide Keeper',
    rarity: 'COMMON',
    color: '#6FC8FF',
    description: 'Carrying the memory of a thousand oceans.',
  },
  {
    id: 'ember',
    units: 21,
    name: 'Ember Cub',
    rarity: 'COMMON',
    color: '#FF7F66',
    description: 'Small spark. Boundless spirit.',
  },
  {
    id: 'eclipse',
    units: 7,
    name: 'Eclipse Knight',
    rarity: 'RARE',
    color: '#FFD84D',
    description: 'Between the last light and the first star.',
  },
  {
    id: 'aurora',
    units: 7,
    name: 'Aurora Warden',
    rarity: 'RARE',
    color: '#62E3C8',
    description: 'A keeper of light at the edge of the universe.',
  },
  {
    id: 'void',
    units: 2,
    name: 'The Void Prince',
    rarity: 'SECRET',
    color: '#C8A8FF',
    description: 'Some things are better left undiscovered.',
  },
] as const;
export type CharacterId = (typeof characters)[number]['id'];
export const phases = [
  'UPCOMING',
  'ACTIVE_PREORDER',
  'PREORDER_CLOSED',
  'TRADE_WINDOW',
  'ALLOCATION_LOCKED',
  'IN_PRODUCTION',
  'SHIPPING',
  'COMPLETED',
] as const;
/** Phases before a campaign goes live, and the cancelled end state. */
export type Phase = (typeof phases)[number] | 'DRAFT' | 'IN_REVIEW' | 'CANCELLED';
/** Position in the live lifecycle, or -1 for DRAFT, IN_REVIEW and CANCELLED. */
export const phaseIndex = (phase: string) => (phases as readonly string[]).indexOf(phase);
const phaseNames: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  CANCELLED: 'Cancelled',
  UPCOMING: 'Upcoming',
  ACTIVE_PREORDER: 'Preorder open',
  PREORDER_CLOSED: 'Preorder closed',
  TRADE_WINDOW: 'Trade window',
  ALLOCATION_LOCKED: 'Allocation locked',
  IN_PRODUCTION: 'In production',
  SHIPPING: 'Shipping',
  COMPLETED: 'Completed',
};
export const phaseLabel = (phase: string) => phaseNames[phase] ?? phase;
export const questConfig = {
  title: 'The fragment run',
  duration: 30,
  waves: 15,
  requiredScore: 10,
  theme: 'astral',
  reward: 1,
};
export const lore = [
  {
    question: 'When does an Astral Kin come to life?',
    options: [
      'Before anyone orders',
      'After orders and trades are final',
      'As soon as the quest starts',
    ],
    answer: 1,
  },
  {
    question: 'Which exchange keeps the constellation in balance?',
    options: ['Rare for rare', 'Common for secret', 'Any rarity for any other'],
    answer: 0,
  },
  {
    question: 'What does completing the quest unlock?',
    options: [
      'A guaranteed character',
      'A free physical collectible',
      'Access to one blind-box preorder',
    ],
    answer: 2,
  },
];
export const money = (cents: number) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(cents / 100);
/** Compact Singapore-dollar label for prices, e.g. S$18.90. */
export const sgd = (cents: number) => 'S$' + (cents / 100).toFixed(2);
