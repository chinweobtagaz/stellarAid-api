/**
 * Admin user management — list, inspect, update and soft-delete users.
 *
 * Safety rules:
 * - An admin cannot change their own role or delete themselves, so the last
 *   admin can never lock everyone out by accident.
 * - Role changes and deletion revoke the user's refresh tokens so the change
 *   takes effect when their current access token expires.
 */

import { AppError } from '@/middlewares';
import { prisma } from '@/services';
import type { Prisma, User } from '@prisma/client';
import type { AdminListUsersQuery, AdminUpdateUserSchema } from '@/validators';

import { toPublicUser, type PublicUser } from './auth.service';
import { revokeAllUserTokens } from './token.service';

export type AdminUserView = PublicUser & {
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

export interface Paginated<T> {
  readonly items: T[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export function toAdminUserView(user: User): AdminUserView {
  return { ...toPublicUser(user), updatedAt: user.updatedAt, deletedAt: user.deletedAt };
}

function buildListWhere(query: AdminListUsersQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};
  if (query.status === 'active') {
    where.deletedAt = null;
  } else if (query.status === 'deleted') {
    where.deletedAt = { not: null };
  }
  if (query.role !== undefined) {
    where.role = query.role;
  }
  if (query.emailVerified !== undefined) {
    where.emailVerified = query.emailVerified;
  }
  if (query.search !== undefined) {
    where.OR = (['email', 'name', 'username'] as const).map((field) => ({
      [field]: { contains: query.search, mode: 'insensitive' },
    }));
  }
  return where;
}

export async function listUsers(query: AdminListUsersQuery): Promise<Paginated<AdminUserView>> {
  const where = buildListWhere(query);
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    items: users.map(toAdminUserView),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit),
  };
}

async function findUserOrThrow(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (user === null) {
    throw AppError.notFound('User not found');
  }
  return user;
}

export async function getUserById(id: string): Promise<AdminUserView> {
  return toAdminUserView(await findUserOrThrow(id));
}

export async function updateUser(
  actorId: string,
  id: string,
  input: AdminUpdateUserSchema,
): Promise<AdminUserView> {
  const existing = await findUserOrThrow(id);
  if (existing.deletedAt !== null) {
    throw AppError.conflict('Cannot update a deleted user');
  }
  const roleChanged = input.role !== undefined && input.role !== existing.role;
  if (roleChanged && actorId === id) {
    throw AppError.forbidden('Admins cannot change their own role');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.role !== undefined && { role: input.role }),
      ...(input.emailVerified !== undefined && { emailVerified: input.emailVerified }),
    },
  });
  if (roleChanged) {
    await revokeAllUserTokens(id);
  }
  return toAdminUserView(updated);
}

export async function softDeleteUser(actorId: string, id: string): Promise<void> {
  if (actorId === id) {
    throw AppError.forbidden('Admins cannot delete their own account');
  }
  const existing = await findUserOrThrow(id);
  if (existing.deletedAt !== null) {
    throw AppError.notFound('User not found');
  }
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  await revokeAllUserTokens(id);
}
