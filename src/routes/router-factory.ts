/**
 * Router factory.
 *
 * Produces feature-scoped Express routers so every feature mounts through the
 * same construction path. Features that need shared protection (e.g. auth)
 * get their middleware attached here instead of in each route file.
 */

import { Router, type RequestHandler, type Router as ExpressRouter } from 'express';
import { authenticate, authLimiter, requireRole } from '@/middlewares';

const FEATURE_MIDDLEWARE: Record<string, readonly RequestHandler[] | undefined> = {
  auth: [authLimiter],
  admin: [authenticate, requireRole('ADMIN')],
};

export function createFeatureRouter(feature: string): ExpressRouter {
  const router = Router({ mergeParams: true });
  const middleware = FEATURE_MIDDLEWARE[feature];
  if (middleware !== undefined) {
    router.use(...middleware);
  }
  return router;
}
