export const characters = [
  {
    id: 'nova',
    name: 'Nova Scout',
    rarity: 'COMMON',
    color: '#c99160',
    description: 'The first light on an uncharted horizon.',
  },
  {
    id: 'moss',
    name: 'Moss Oracle',
    rarity: 'COMMON',
    color: '#87a58b',
    description: 'A quiet guardian of worlds still growing.',
  },
  {
    id: 'tide',
    name: 'Tide Keeper',
    rarity: 'COMMON',
    color: '#80a8b8',
    description: 'Carrying the memory of a thousand oceans.',
  },
  {
    id: 'ember',
    name: 'Ember Cub',
    rarity: 'COMMON',
    color: '#c7795a',
    description: 'Small spark. Boundless spirit.',
  },
  {
    id: 'eclipse',
    name: 'Eclipse Knight',
    rarity: 'RARE',
    color: '#d7ae70',
    description: 'Between the last light and the first star.',
  },
  {
    id: 'aurora',
    name: 'Aurora Warden',
    rarity: 'RARE',
    color: '#a2c6b9',
    description: 'A keeper of light at the edge of the universe.',
  },
  {
    id: 'void',
    name: 'The Void Prince',
    rarity: 'SECRET',
    color: '#b7b2cb',
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
export type Phase = (typeof phases)[number];
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
