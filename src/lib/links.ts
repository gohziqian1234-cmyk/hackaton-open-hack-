import type { ThemeInfo } from './types';

/** Drop page link for a campaign: its theme slug when it has one, otherwise the campaign id. */
export function dropHref(themes: ThemeInfo[] | undefined, campaignId: string) {
  const theme = themes?.find((t) => t.campaign_id === campaignId);
  return '/drops/' + (theme?.slug ?? campaignId);
}
/** Theme for a campaign, if any. */
export const themeFor = (themes: ThemeInfo[] | undefined, campaignId: string | undefined) =>
  campaignId ? (themes?.find((t) => t.campaign_id === campaignId) ?? null) : null;
/** Query string that selects a non-default campaign on /quest, /checkout and friends. */
export const campaignQuery = (campaignId: string) =>
  campaignId === 'astral' ? '' : '?campaign=' + encodeURIComponent(campaignId);
