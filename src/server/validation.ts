import { z } from 'zod';
const id = z.string().min(1).max(100);
// Invisible and direction-changing characters are never valid in user text.
const INVISIBLE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
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
const listingKey = z.string().regex(/^lst-[a-z0-9-]{1,40}$/);
const uuid = z.string().regex(/^[0-9a-f-]{36}$/);
export const listingSchema = z.object({
  listingId: listingKey.optional(),
  title: line(4, 80),
  theme: line(2, 30),
  description: paragraph(0, 1000),
  price: z.number().int().min(100).max(100000),
  fulfilment: z.enum(['SHIP', 'MEETUP', 'BOTH']),
  characters: z
    .array(
      z.object({
        name: line(2, 40),
        rarity: z.enum(['COMMON', 'RARE', 'SECRET']),
        declared: z.number().int().min(1).max(500),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      }),
    )
    .min(2)
    .max(12),
  photoIds: z.array(uuid).max(6),
});
export type ListingInput = z.infer<typeof listingSchema>;
/** Singapore mobile numbers only in this MVP: +65 then 8 digits starting 3, 6, 8 or 9. */
const phone = z
  .string()
  .max(20)
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\+65[3689]\d{7}$/));
const marketOrderId = z.string().regex(/^mko-[a-z0-9-]{1,40}$/);
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
  z.object({
    action: z.literal('start'),
    mode: z.enum(['run', 'lore']),
    campaignId: slug.optional(),
  }),
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
  z.object({ action: z.literal('notifyTheme'), slug }),
  z.object({ action: z.literal('openSlot'), accessId: id }),
  z.object({ action: z.literal('claimPhysical'), code: z.string().min(1).max(300) }),
  z.object({
    action: z.literal('generatePhysical'),
    themeSlug: slug,
    count: z.number().int().min(1).max(60),
  }),
  z.object({ action: z.literal('declineItem'), itemId: id }),
  z.object({
    action: z.literal('confirmItems'),
    itemIds: z.array(id).min(1).max(10),
    ageConfirmed: z.literal(true),
    understood: z.literal(true),
  }),
  z.discriminatedUnion('channel', [
    z.object({ action: z.literal('sendOtp'), channel: z.literal('EMAIL'), target: email }),
    z.object({ action: z.literal('sendOtp'), channel: z.literal('PHONE'), target: phone }),
  ]),
  z.object({
    action: z.literal('verifyOtp'),
    channel: z.enum(['EMAIL', 'PHONE']),
    code: z.string().regex(/^\d{6}$/),
  }),
  z.object({ action: z.literal('saveListing'), listing: listingSchema }),
  z.object({ action: z.literal('publishListing'), listingId: listingKey }),
  z.object({ action: z.literal('pauseListing'), listingId: listingKey }),
  z.object({
    action: z.literal('buyListing'),
    listingId: listingKey,
    quantity: z.number().int().min(1).max(10),
    ageConfirmed: z.literal(true),
  }),
  z.object({ action: z.literal('fulfil'), orderId: marketOrderId, note: paragraph(0, 300) }),
  z.object({ action: z.literal('confirmReceipt'), orderId: marketOrderId }),
  z.object({
    action: z.literal('report'),
    orderId: marketOrderId,
    reason: z.enum(['WRONG_ITEM', 'MISSING_ITEM', 'NOT_DELIVERED', 'OTHER']),
    details: paragraph(0, 1000),
  }),
  z.object({
    action: z.literal('resolveReport'),
    reportId: uuid,
    decision: z.enum(['UPHOLD', 'DISMISS']),
  }),
  z.object({
    action: z.literal('sendMessage'),
    threadId: z.string().regex(/^[a-z0-9-]{1,40}$/),
    body: paragraph(1, 1000),
  }),
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
export const marketQuerySchema = z.object({
  q: line(0, 60).optional(),
  theme: line(0, 30).optional(),
  min: z.coerce.number().int().min(0).max(100000).optional(),
  max: z.coerce.number().int().min(0).max(100000).optional(),
  rarity: z.enum(['COMMON', 'RARE', 'SECRET']).optional(),
});
