// Single source of truth for character and theme images (kit: src/data/image-manifest.json).
// Components never build /images/themes/ paths themselves: they ask this module.
import manifest from '../data/image-manifest.json';

export type ImageVariant = 'card' | 'thumb' | 'hero' | 'poster';
export type ThemeImage = {
  src: string;
  width: number;
  height: number;
  /** `image`: a real file. `original`: the theme draws its own art (Astral Kin's kin). `placeholder`: neutral initial tile. */
  kind: 'image' | 'original' | 'placeholder';
};
type Entry = { path: string; width: number; height: number };
const images = manifest as unknown as Record<string, Partial<Record<ImageVariant | 'cover', Entry>>>;

/** Themes that ship their own illustrated characters instead of image files. */
const ORIGINAL_ART = new Set(['astral-kin']);
export const hasOriginalArt = (themeSlug: string) => ORIGINAL_ART.has(themeSlug);

const SIZES: Record<ImageVariant, [number, number]> = {
  card: [600, 600],
  thumb: [200, 200],
  hero: [800, 1200],
  poster: [1024, 1536],
};

function warn(message: string) {
  if (process.env.NODE_ENV === 'development') console.warn('LoopBox images:', message);
}

/**
 * A neutral tile: rounded square in the theme accent with the character's initial.
 * Never a drawing of a character.
 */
export function placeholderImage(name: string, accent = '#A9A3CF', variant: ImageVariant = 'card') {
  const [width, height] = SIZES[variant];
  const initial = (name.trim()[0] ?? '?').toUpperCase().replace(/[<>&"']/g, '?');
  const colour = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#A9A3CF';
  const size = Math.min(width, height);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#1C1838"/>` +
    `<rect x="${(width - size * 0.62) / 2}" y="${(height - size * 0.62) / 2}" width="${size * 0.62}" height="${size * 0.62}" rx="${size * 0.1}" fill="${colour}" fill-opacity=".22" stroke="${colour}" stroke-width="${size * 0.012}"/>` +
    `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="${size * 0.28}" fill="${colour}">${initial}</text></svg>`;
  return {
    src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    width,
    height,
    kind: 'placeholder' as const,
  };
}

/** `{ src, width, height }` for one character image variant, with the fallbacks described above. */
export function getCharacterImage(
  themeSlug: string,
  characterSlug: string,
  variant: ImageVariant,
  fallback: { name?: string; accent?: string } = {},
): ThemeImage {
  const entry = images[`${themeSlug}/${characterSlug}`]?.[variant];
  if (entry) return { src: entry.path, width: entry.width, height: entry.height, kind: 'image' };
  if (ORIGINAL_ART.has(themeSlug)) {
    const [width, height] = SIZES[variant];
    return { src: '', width, height, kind: 'original' };
  }
  warn(`no ${variant} image for ${themeSlug}/${characterSlug}; using a placeholder tile`);
  return placeholderImage(fallback.name ?? characterSlug, fallback.accent, variant);
}

/** The 1600×1000 theme cover, or null when the theme has none (coming soon, original art). */
export function getThemeCover(themeSlug: string): Omit<ThemeImage, 'kind'> | null {
  const entry = images[`${themeSlug}/_cover`]?.cover;
  return entry ? { src: entry.path, width: entry.width, height: entry.height } : null;
}

/** Alt text rule from the v2 brief. */
export function characterAlt(name: string, rarity: string, themeName: string, licensed: boolean) {
  return `${name}, ${rarity.toLowerCase()} figure from ${themeName}${licensed ? ' (concept render)' : ''}`;
}
