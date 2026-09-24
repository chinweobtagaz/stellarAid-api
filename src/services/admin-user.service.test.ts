import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, revokeAllUserTokens } = vi.hoisted(() => ({
  prismaMock: {
    user: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
  revokeAllUserTokens: vi.fn(),
}));

vi.mock('@/services', () => ({ prisma: prismaMock }));
vi.mock('./token.service', () => ({ revokeAllUserTokens }));

import { adminListUsersQuerySchema } from '@/validators';

import { getUserById, listUsers, softDeleteUser, updateUser } from './admin-user.service';

const user = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  email: 'ada@example.com',
  passwordHash: 'hash',
  name: 'Ada',
  username: 'ada',
  role: 'USER',
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findMany.mockResolvedValue([user()]);
  prismaMock.user.count.mockResolvedValue(45);
  prismaMock.user.findUnique.mockResolvedValue(user());
  prismaMock.user.update.mockImplementation(({ data }) => Promise.resolve(user(data)));
});

describe('listUsers', () => {
  it('paginates and hides deleted users by default', async () => {
    const query = adminListUsersQuerySchema.parse({ page: '3', limit: '10' });
    const result = await listUsers(query);

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null }, skip: 20, take: 10 }),
    );
    expect(result).toMatchObject({ page: 3, limit: 10, total: 45, totalPages: 5 });
    expect(result.items[0]).not.toHaveProperty('passwordHash');
  });

  it('applies role, emailVerified, search and status filters', async () => {
    const query = adminListUsersQuerySchema.parse({
      role: 'ARTIST',
      emailVerified: 'true',
      search: 'ada',
      status: 'deleted',
    });
    await listUsers(query);

    const { where } = prismaMock.user.findMany.mock.calls[0]![0];
    expect(where).toMatchObject({
      role: 'ARTIST',
      emailVerified: true,
      deletedAt: { not: null },
    });
    expect(where.OR).toHaveLength(3);
    expect(prismaMock.user.count).toHaveBeenCalledWith({ where });
  });

  it('status=all does not filter on deletedAt', async () => {
    await listUsers(adminListUsersQuerySchema.parse({ status: 'all' }));
    expect(prismaMock.user.findMany.mock.calls[0]![0].where).not.toHaveProperty('deletedAt');
  });
});

describe('getUserById', () => {
  it('returns 404 for an unknown user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(getUserById('missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateUser', () => {
  it('updates emailVerified without revoking sessions', async () => {
    const result = await updateUser('admin-1', 'user-1', { emailVerified: true });
    expect(result.emailVerified).toBe(true);
    expect(revokeAllUserTokens).not.toHaveBeenCalled();
  });

  it('revokes refresh tokens when the role changes', async () => {
    await updateUser('admin-1', 'user-1', { role: 'ARTIST' });
    expect(revokeAllUserTokens).toHaveBeenCalledWith('user-1');
  });

  it('forbids admins from changing their own role', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ id: 'admin-1', role: 'ADMIN' }));
    await expect(updateUser('admin-1', 'admin-1', { role: 'USER' })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects updates to a deleted user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ deletedAt: new Date() }));
    await expect(updateUser('admin-1', 'user-1', { emailVerified: true })).rejects.toMatchObject(
      { statusCode: 409 },
    );
  });
});

describe('softDeleteUser', () => {
  it('sets deletedAt and revokes refresh tokens', async () => {
    await softDeleteUser('admin-1', 'user-1');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(revokeAllUserTokens).toHaveBeenCalledWith('user-1');
  });

  it('forbids self-deletion', async () => {
    await expect(softDeleteUser('admin-1', 'admin-1')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 404 for an already deleted user', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ deletedAt: new Date() }));
    await expect(softDeleteUser('admin-1', 'user-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});
