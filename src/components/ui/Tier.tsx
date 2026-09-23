const labels = { COMMON: 'Common', RARE: 'Rare', SECRET: 'Secret' } as const;
export type Rarity = keyof typeof labels;
/** Rarity badge with the tier's foil finish. */
export function Tier({ rarity, children }: { rarity: string; children?: React.ReactNode }) {
  const key = (rarity in labels ? rarity : 'COMMON') as Rarity;
  return <span className={'tier ' + key.toLowerCase()}>{children ?? labels[key]}</span>;
}
