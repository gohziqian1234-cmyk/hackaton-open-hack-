import { z } from 'zod';
const id = z.string().min(1).max(100);
// Invisible and direction-changing characters are never valid in user text.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
/** One-line text: NFKC-normalised, control characters removed, spaces collapsed, trimmed. */
export const line = (min: number, max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((v) => v.normalize('NFKC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min).max(max));
/** Multi-line text: like `line` but keeps single line breaks. */
export const paragraph = (min: number, max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((v) =>
      v
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .replace(INVISIBLE, '')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    )
    .pipe(z.string().min(min).max(max));
export const email = z
  .string()
  .max(254)
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.email());
/** http(s) only, so a stored link can never be a javascript: URL. */
export const webUrl = z
  .string()
  .max(300)
  .transform((v) => v.trim())
  .pipe(z.url({ protocol: /^https?$/ }));
const slug = z.string().regex(/^[a-z0-9-]{1,64}$/);
const epoch = z.number().int().positive().max(4102444800000);
const applicationBase = {
  orgName: line(2, 80),
  contactEmail: email,
  proposedSeries: paragraph(10, 500),
  ipOwnership: z.literal(true),
  ipStatement: paragraph(20, 1000),
};
export const applicationSchema = z.discriminatedUnion('type', [
  z.object({ ...applicationBase, type: z.literal('BRAND'), website: webUrl, proofUrl: webUrl }),
  z.object({
    ...applicationBase,
    type: z.literal('COLLECTIVE'),
    membersCount: z.number().int().min(2).max(500),
    portfolioUrl: webUrl,
  }),
]);
export type ApplicationInput = z.infer<typeof applicationSchema>;
export const campaignSchema = z.object({
  campaignId: slug.optional(),
  name: line(2, 60),
  description: paragraph(10, 500),
  price: z.number().int().min(100).max(100000),
  capacity: z.number().int().min(2).max(1000),
  max_per_user: z.number().int().min(1).max(10),
  starts_at: epoch,
  ends_at: epoch,
  trade_ends_at: epoch,
  game_mode: z.enum(['run', 'lore']),
  required_score: z.number().int().min(1).max(15),
  attempts_per_day: z.number().int().min(1).max(20),
  characters: z
    .array(
      z.object({
        name: line(2, 40),
        rarity: z.enum(['COMMON', 'RARE', 'SECRET']),
        units: z.number().int().min(1).max(1000),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        description: line(0, 140),
      }),
    )
    .min(2)
    .max(8),
});
export type CampaignInput = z.infer<typeof campaignSchema>;
export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), user: z.string().regex(/^[a-z0-9-]{1,40}$/) }),
  z.object({
    action: z.literal('signup'),
    name: line(1, 60),
    email,
    password: z.string().min(10).max(128),
  }),
  z.object({ action: z.literal('signin'), email, password: z.string().min(1).max(128) }),
  z.object({ action: z.literal('signout') }),
  z.object({ action: z.literal('start'), mode: z.enum(['run', 'lore']), campaignId: slug.optional() }),
  z.object({ action: z.literal('demoWin'), campaignId: slug.optional() }),
  z.object({
    action: z.literal('complete'),
    sessionId: id,
    values: z.array(z.number().int().min(0).max(2)).max(15),
  }),
  z.object({ action: z.literal('preorder'), accessId: id }),
  z.object({ action: z.literal('checkout'), accessId: id, ageConfirmed: z.literal(true) }),
  z.object({ action: z.literal('cancelCheckout') }),
  z.object({ action: z.literal('reveal'), allocationId: id }),
  z.object({ action: z.literal('trade'), allocationId: id, wants: z.array(id).min(1).max(6) }),
  z.object({ action: z.literal('keep'), allocationId: id }),
  z.object({ action: z.literal('respond'), matchId: id, accept: z.boolean() }),
  z.object({ action: z.literal('advance'), campaignId: slug.optional() }),
  z.object({ action: z.literal('publishCampaign'), campaignId: slug }),
  z.object({ action: z.literal('closeCampaign'), campaignId: slug }),
  z.object({ action: z.literal('sweep') }),
  z.object({ action: z.literal('applyPartner'), application: applicationSchema }),
  z.object({
    action: z.literal('decideApplication'),
    applicationId: id,
    decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_INFO']),
    note: paragraph(0, 500).optional(),
  }),
  z.object({ action: z.literal('saveDraftCampaign'), campaign: campaignSchema }),
  z.object({ action: z.literal('submitCampaign'), campaignId: slug }),
  z.object({ action: z.literal('waitlist'), campaignId: slug.optional() }),
  z.object({
    action: z.literal('edit'),
    changes: z.object({
      name: z.string().min(2).max(60),
      description: z.string().min(10).max(500),
      price: z.number().int().min(100).max(100000),
      capacity: z.number().int().min(1).max(10000),
      max_per_user: z.number().int().min(1).max(10),
      starts_at: z.number().int().positive(),
      ends_at: z.number().int().positive(),
      trade_ends_at: z.number().int().positive(),
      weights: z.array(z.number().positive().max(10000)).length(7),
      required_score: z.number().int().min(1).max(15).optional(),
      attempts_per_day: z.number().int().min(1).max(20).optional(),
    }),
  }),
]);
export const simulateSchema = z.object({ orderId: id, kind: z.enum(['B2C', 'C2C']) });
