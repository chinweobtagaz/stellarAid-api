/**
 * Authentication and role-based authorization guards.
 *
 * `authenticate` verifies the `Authorization: Bearer <jwt>` access token and
 * attaches `{ id, role }` to `req.user`. `requireRole(...)` must run after it
 * and rejects callers whose role is not in the allowed list with 403.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@prisma/client';

import { verifyAccessToken } from '@/services/token.service';

import { AppError } from './app-error.middleware';

export interface AuthUser {
  readonly id: string;
  readonly role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const [scheme, token] = header?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token === '') {
    next(new AppError('UNAUTHORIZED', 'Missing bearer token'));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    next(err);
  }
};

export function requireRole(...roles: readonly Role[]): RequestHandler {
  return (req, _res, next) => {
    if (req.user === undefined) {
      next(new AppError('UNAUTHORIZED', 'Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError('FORBIDDEN', 'Insufficient permissions'));
      return;
    }
    next();
  };
}

/** Get the authenticated user; throws if `authenticate` did not run. */
export function getAuthUser(req: Request): AuthUser {
  if (req.user === undefined) {
    throw new AppError('UNAUTHORIZED', 'Authentication required');
  }
  return req.user;
}
