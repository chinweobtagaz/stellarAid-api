/**
 * Authentication service — register, login and refresh token rotation.
 *
 * Responses never include the password hash. Login failures are deliberately
 * generic ("Invalid email or password") to avoid user enumeration.
 */

import { randomBytes } from 'node:crypto';

import { AppError } from '@/middlewares';
import { prisma } from '@/services';
import { comparePassword, hashPassword } from '@/utils';
import type { Role, User } from '@prisma/client';

import {
  issueTokenPair,
  revokeRefreshToken,
  verifyRefreshToken,
  type TokenPair,
} from './token.service';

export type PublicUser = {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly role: Role;
  readonly emailVerified: boolean;
  readonly createdAt: Date;
};

export interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: Role;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

function usernameFromEmail(email: string): string {
  const base = (email.split('@')[0] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  return base === '' ? 'user' : base;
}

async function uniqueUsername(email: string): Promise<string> {
  const base = usernameFromEmail(email);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}_${randomBytes(3).toString('hex')}`;
    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    if (existing === null) {
      return candidate;
    }
  }
  throw new AppError('INTERNAL_ERROR', 'Could not allocate a unique username, please retry');
}

export async function registerUser(input: RegisterInput): Promise<{
  user: PublicUser;
  tokens: TokenPair;
  verificationToken: string;
}> {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing !== null) {
    throw new AppError('CONFLICT', 'Email already registered');
  }

  const passwordHash = await hashPassword(input.password);
  const username = await uniqueUsername(email);
  const verificationToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, passwordHash, name: input.name, username, role: input.role },
    });
    await tx.emailVerification.create({
      data: { userId: created.id, token: verificationToken, expiresAt },
    });
    return created;
  });

  const tokens = await issueTokenPair({ id: user.id, role: user.role });
  return { user: toPublicUser(user), tokens, verificationToken };
}

export async function loginUser(
  input: LoginInput,
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const email = input.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (
    user === null ||
    user.deletedAt !== null ||
    !(await comparePassword(input.password, user.passwordHash))
  ) {
    throw new AppError('UNAUTHORIZED', 'Invalid email or password');
  }
  const tokens = await issueTokenPair({ id: user.id, role: user.role });
  return { user: toPublicUser(user), tokens };
}

export async function refreshSession(rawToken: string): Promise<{
  user: PublicUser;
  tokens: TokenPair;
}> {
  const { refreshTokenId, sub } = await verifyRefreshToken(rawToken);
  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (user === null || user.deletedAt !== null) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token');
  }
  await revokeRefreshToken(refreshTokenId);
  const tokens = await issueTokenPair({ id: user.id, role: user.role });
  return { user: toPublicUser(user), tokens };
}
