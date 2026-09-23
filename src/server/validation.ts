import { z } from 'zod';
const id = z.string().min(1).max(100);
const slug = z.string().regex(/^[a-z0-9-]{1,64}$/);
export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), user: z.string().regex(/^[a-z0-9-]{1,40}$/) }),
  z.object({ action: z.literal('start'), mode: z.enum(['run', 'lore']) }),
  z.object({ action: z.literal('demoWin') }),
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
  z.object({ action: z.literal('waitlist') }),
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
