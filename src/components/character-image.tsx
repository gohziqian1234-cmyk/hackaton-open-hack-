'use client';
import { KinArt } from './art';
import {
  characterAlt,
  getCharacterImage,
  placeholderImage,
  type ImageVariant,
} from '../lib/images';
import type { ThemeInfo } from '../lib/types';

export type ImageCharacter = {
  id: string;
  name: string;
  rarity: string;
  slug?: string | null;
  color?: string | null;
  campaign_id: string;
};

/** Every character picture goes through here: kit image, Astral Kin's own art, or a neutral tile. */
export function CharacterImage({
  character,
  theme,
  variant = 'card',
  className = '',
  eager = false,
}: {
  character: ImageCharacter;
  theme?: ThemeInfo | null;
  variant?: ImageVariant;
  className?: string;
  eager?: boolean;
}) {
  const themeSlug = theme?.slug ?? character.campaign_id;
  const img = getCharacterImage(themeSlug, character.slug ?? character.id, variant, {
    name: character.name,
    accent: theme?.accent ?? character.color ?? undefined,
  });
  if (img.kind === 'original')
    return (
      <KinArt
        id={character.id}
        name={character.name}
        color={character.color}
        className={('char-art ' + className).trim()}
      />
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={('char-img char-' + variant + ' ' + className).trim()}
      src={img.src}
      width={img.width}
      height={img.height}
      alt={characterAlt(
        character.name,
        character.rarity,
        theme?.name ?? 'LoopBox',
        !!theme?.licensed,
      )}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
    />
  );
}

/** Visible badge on every surface that shows a licensed concept theme. */
export function ConceptBadge({
  theme,
  compact = false,
}: {
  theme?: ThemeInfo | null;
  compact?: boolean;
}) {
  if (!theme?.licensed) return null;
  return (
    <span className={'concept-badge' + (compact ? ' compact' : '')}>
      Concept partner drop — demo only, not licensed
    </span>
  );
}

/** Caption under any hero or poster image of a licensed theme. */
export function ConceptCaption({ theme }: { theme?: ThemeInfo | null }) {
  if (!theme?.licensed) return null;
  return <p className="concept-caption">Concept render</p>;
}

/** Neutral initial tile for characters without artwork (marketplace series, partner drafts). */
export function CharacterTile({
  name,
  color,
  rarity,
  origin = 'LoopBox',
  className = '',
}: {
  name: string;
  color?: string | null;
  rarity?: string;
  origin?: string;
  className?: string;
}) {
  const img = placeholderImage(name || '?', color ?? undefined, 'card');
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={('char-img char-card char-tile ' + className).trim()}
      src={img.src}
      width={img.width}
      height={img.height}
      alt={
        rarity ? `${name}, ${rarity.toLowerCase()} figure from ${origin}` : `${name} from ${origin}`
      }
      loading="lazy"
      decoding="async"
    />
  );
}
