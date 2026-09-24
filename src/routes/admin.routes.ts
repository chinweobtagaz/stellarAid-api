/**
 * Admin routes (v1).
 *
 * `createFeatureRouter('admin')` attaches `authenticate` + `requireRole('ADMIN')`
 * to every route, so non-admins get 401/403 before reaching a handler.
 *
 * @openapi
 * /api/v1/admin/users:
 *   get:
 *     summary: List users (admin)
 *     tags: [Admin]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: role, schema: { type: string, enum: [USER, ARTIST, ADMIN] } }
 *       - { in: query, name: emailVerified, schema: { type: boolean } }
 *       - { in: query, name: search, description: Matches email, name or username, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, deleted, all], default: active } }
 *     responses:
 *       200:
 *         description: Paginated users ({ items, page, limit, total, totalPages })
 *       401:
 *         description: Missing or invalid access token
 *       403:
 *         description: Caller is not an admin
 * /api/v1/admin/users/{id}:
 *   get:
 *     summary: Get a user (admin)
 *     tags: [Admin]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: User detail (includes soft-deleted users)
 *       404:
 *         description: User not found
 *   patch:
 *     summary: Update a user's role or email verification (admin)
 *     description: Changing a role revokes the user's refresh tokens. Admins
 *       cannot change their own role.
 *     tags: [Admin]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role: { type: string, enum: [USER, ARTIST, ADMIN] }
 *               emailVerified: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated user
 *       403:
 *         description: Admin attempted to change their own role
 *       404:
 *         description: User not found
 *       409:
 *         description: User is deleted
 *       422:
 *         description: Validation failed
 *   delete:
 *     summary: Soft-delete a user (admin)
 *     description: Sets deletedAt and revokes the user's refresh tokens. Deleted
 *       users can no longer log in.
 *     tags: [Admin]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204:
 *         description: User soft-deleted
 *       403:
 *         description: Admin attempted to delete themselves
 *       404:
 *         description: User not found or already deleted
 */

import { adminDeleteUser, adminGetUser, adminListUsers, adminUpdateUser } from '@/controllers';
import { validate } from '@/middlewares';
import {
  adminListUsersQuerySchema,
  adminUpdateUserSchema,
  adminUserIdParamsSchema,
} from '@/validators';

import { createFeatureRouter } from './router-factory';

export const adminRouter = createFeatureRouter('admin');

adminRouter.get('/users', validate({ query: adminListUsersQuerySchema }), adminListUsers);
adminRouter.get('/users/:id', validate({ params: adminUserIdParamsSchema }), adminGetUser);
adminRouter.patch(
  '/users/:id',
  validate({ params: adminUserIdParamsSchema, body: adminUpdateUserSchema }),
  adminUpdateUser,
);
adminRouter.delete('/users/:id', validate({ params: adminUserIdParamsSchema }), adminDeleteUser);
