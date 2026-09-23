import { z } from 'zod';
const id = z.string().min(1).max(100);
export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), user: z.enum(['collector', 'business', 'demo-0']) }),
  z.object({ action: z.literal('start'), mode: z.enum(['run', 'lore']) }),
  z.object({
    action: z.literal('complete'),
    sessionId: id,
    values: z.array(z.number().int().min(0).max(2)).max(15),
  }),
  z.object({ action: z.literal('preorder'), accessId: id }),
  z.object({ action: z.literal('reveal'), allocationId: id }),
  z.object({ action: z.literal('trade'), allocationId: id, wants: z.array(id).min(1).max(6) }),
  z.object({ action: z.literal('keep'), allocationId: id }),
  z.object({ action: z.literal('respond'), matchId: id, accept: z.boolean() }),
  z.object({ action: z.literal('advance') }),
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
    }),
  }),
]);
