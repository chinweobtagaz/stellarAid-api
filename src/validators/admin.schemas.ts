/**
 * Admin user-management request schemas.
 */

import { z } from 'zod';

import { paginationSchema, uuidSchema } from './common.schemas';

const roleSchema = z.enum(['USER', 'ARTIST', 'ADMIN']);

/** Query-string booleans arrive as strings; accept only 'true' / 'false'. */
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

export const adminUserIdParamsSchema = z.object({
  id: uuidSchema,
});

export const adminListUsersQuerySchema = paginationSchema.extend({
  role: roleSchema.optional(),
  emailVerified: booleanQuery.optional(),
  /** Case-insensitive match against email, name or username. */
  search: z.string().trim().min(1).max(120).optional(),
  /** Which users to include relative to soft deletion. */
  status: z.enum(['active', 'deleted', 'all']).default('active'),
});

export const adminUpdateUserSchema = z
  .object({
    role: roleSchema.optional(),
    emailVerified: z.boolean().optional(),
  })
  .strict()
  .refine((body) => body.role !== undefined || body.emailVerified !== undefined, {
    error: 'Provide at least one of role or emailVerified.',
  });

export type AdminUserIdParams = z.infer<typeof adminUserIdParamsSchema>;
export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;
export type AdminUpdateUserSchema = z.infer<typeof adminUpdateUserSchema>;
