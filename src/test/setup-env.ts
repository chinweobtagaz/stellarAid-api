/**
 * Test environment defaults.
 *
 * `@/config` validates `process.env` at import time; unit tests never touch a
 * real database or Redis, so provide deterministic placeholder values.
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-16-chars';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-16';
process.env.ACCESS_TOKEN_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '7';
delete process.env.REDIS_URL;
