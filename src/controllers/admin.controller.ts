/**
 * Admin user-management controller.
 *
 * Routes are guarded by `authenticate` + `requireRole('ADMIN')` via the router
 * factory; handlers stay thin wrappers over the admin user service.
 */

import type { Response } from 'express';

import { catchAsync, getAuthUser, getValidated } from '@/middlewares';
import {
  getUserById,
  listUsers,
  softDeleteUser,
  updateUser,
  type AdminUserView,
  type Paginated,
} from '@/services';
import type { ApiResponse } from '@/types';
import type { AdminListUsersQuery, AdminUpdateUserSchema, AdminUserIdParams } from '@/validators';

/** GET /api/v1/admin/users */
export const adminListUsers = catchAsync(
  async (req, res: Response<ApiResponse<Paginated<AdminUserView>>>) => {
    const { query } = getValidated<unknown, unknown, AdminListUsersQuery>(req);
    res.status(200).json({ success: true, data: await listUsers(query) });
  },
);

/** GET /api/v1/admin/users/:id */
export const adminGetUser = catchAsync(async (req, res: Response<ApiResponse<AdminUserView>>) => {
  const { params } = getValidated<unknown, AdminUserIdParams, unknown>(req);
  res.status(200).json({ success: true, data: await getUserById(params.id) });
});

/** PATCH /api/v1/admin/users/:id */
export const adminUpdateUser = catchAsync(
  async (req, res: Response<ApiResponse<AdminUserView>>) => {
    const { body, params } = getValidated<AdminUpdateUserSchema, AdminUserIdParams, unknown>(req);
    const user = await updateUser(getAuthUser(req).id, params.id, body);
    res.status(200).json({ success: true, data: user });
  },
);

/** DELETE /api/v1/admin/users/:id */
export const adminDeleteUser = catchAsync(async (req, res: Response) => {
  const { params } = getValidated<unknown, AdminUserIdParams, unknown>(req);
  await softDeleteUser(getAuthUser(req).id, params.id);
  res.status(204).end();
});
