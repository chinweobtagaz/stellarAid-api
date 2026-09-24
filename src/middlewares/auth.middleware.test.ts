import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services', () => ({ prisma: {} }));

import { generateAccessToken } from '@/services/token.service';

import { AppError } from './app-error.middleware';
import { authenticate, requireRole } from './auth.middleware';

function run(handler: ReturnType<typeof requireRole>, req: Partial<Request>): unknown {
  const next = vi.fn() as unknown as NextFunction & { mock: { calls: unknown[][] } };
  handler(req as Request, {} as Response, next);
  expect(next).toHaveBeenCalledOnce();
  return next.mock.calls[0]![0];
}

describe('authenticate', () => {
  it('attaches the user from a valid bearer token', async () => {
    const token = await generateAccessToken({ id: 'admin-1', role: 'ADMIN' });
    const req: Partial<Request> = { headers: { authorization: `Bearer ${token}` } };
    expect(run(authenticate, req)).toBeUndefined();
    expect(req.user).toEqual({ id: 'admin-1', role: 'ADMIN' });
  });

  it.each([undefined, 'Basic abc', 'Bearer ', 'Bearer'])(
    'rejects header %s with 401',
    (authorization) => {
      const err = run(authenticate, { headers: { authorization } });
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(401);
    },
  );

  it('rejects an invalid token with 401', () => {
    const err = run(authenticate, { headers: { authorization: 'Bearer nope' } });
    expect((err as AppError).statusCode).toBe(401);
  });
});

describe('requireRole', () => {
  const adminOnly = requireRole('ADMIN');

  it('allows a user with an allowed role', () => {
    expect(run(adminOnly, { user: { id: 'a', role: 'ADMIN' } })).toBeUndefined();
  });

  it('returns 403 for a user without the role', () => {
    const err = run(adminOnly, { user: { id: 'u', role: 'USER' } });
    expect((err as AppError).statusCode).toBe(403);
  });

  it('returns 401 when authenticate has not run', () => {
    const err = run(adminOnly, {});
    expect((err as AppError).statusCode).toBe(401);
  });
});
