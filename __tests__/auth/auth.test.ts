/**
 * @jest-environment node
 */

// ─── Mocks (hoisted) ──────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    verificationToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('next-auth', () => ({
  default: jest.fn(),
  getServerSession: jest.fn(),
}));

jest.mock('@/lib/ratelimit', () => ({
  createRatelimit: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
  genSalt: jest.fn(),
}));

jest.mock('@/lib/resend', () => ({
  getResendClient: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createRatelimit } from '@/lib/ratelimit';
import { getResendClient } from '@/lib/resend';
import { POST as createWorkerRoute } from '@/app/api/users/route';
import { PUT as updateWorkerRoute } from '@/app/api/users/[id]/route';
import { PATCH as deactivateWorkerRoute } from '@/app/api/users/[id]/deactivate/route';
import { PUT as updateMeRoute } from '@/app/api/users/me/route';
import { POST as forgotPasswordRoute } from '@/app/api/auth/forgot-password/route';
import { POST as resetPasswordRoute } from '@/app/api/auth/reset-password/route';
import { authorizeCredentials, DUMMY_HASH } from '@/lib/auth';

// ─── Typed mock helpers ───────────────────────────────────────────────────────

type MockDb = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  verificationToken: {
    create: jest.Mock;
    findFirst: jest.Mock;
    deleteMany: jest.Mock;
  };
};

const db = prisma as unknown as MockDb;
const mockGetServerSession = getServerSession as jest.Mock;
const mockBcryptCompare = bcrypt.compare as jest.Mock;
const mockBcryptHash = bcrypt.hash as jest.Mock;
const mockCreateRatelimit = createRatelimit as jest.Mock;
const mockGetResendClient = getResendClient as jest.Mock;

// ─── Setup ────────────────────────────────────────────────────────────────────

const ownerSession = { user: { id: 'owner-id', role: 'OWNER', isActive: true } };
const workerSession = { user: { id: 'worker-id', role: 'WORKER', isActive: true } };

const mockEmailSend = jest.fn().mockResolvedValue({ data: {}, error: null });

beforeEach(() => {
  jest.clearAllMocks();

  // Default rate limiter: allow all
  const mockLimit = jest.fn().mockResolvedValue({ success: true });
  mockCreateRatelimit.mockImplementation(() => ({ limit: mockLimit }));

  // Default bcrypt
  mockBcryptCompare.mockResolvedValue(true);
  mockBcryptHash.mockResolvedValue('hashed_password');

  // Default resend client
  mockGetResendClient.mockReturnValue({
    emails: { send: mockEmailSend },
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Auth Module — 15 required tests', () => {
  // ── Test 1 ─────────────────────────────────────────────────────────────────
  it('1. POST /api/users: OWNER creates worker → 201 with correct shape', async () => {
    mockGetServerSession.mockResolvedValue(ownerSession);
    db.user.create.mockResolvedValue({
      id: 'new-worker-id',
      name: 'Test Worker',
      email: 'worker@example.com',
      role: 'WORKER',
      isActive: true,
    });

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Worker',
        email: 'worker@example.com',
        password: 'password123',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await createWorkerRoute(req);

    expect(res.status).toBe(201);
    const body = await res.json() as unknown;
    expect(body).toMatchObject({
      id: expect.any(String) as unknown,
      name: 'Test Worker',
      email: 'worker@example.com',
      role: 'WORKER',
      isActive: true,
    });
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────────
  it('2. POST /api/users: WORKER caller → 403', async () => {
    mockGetServerSession.mockResolvedValue(workerSession);

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        email: 'test@example.com',
        password: 'password123',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await createWorkerRoute(req);
    expect(res.status).toBe(403);
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────────
  it('3. POST /api/users: duplicate email → 409 with "Email already in use"', async () => {
    mockGetServerSession.mockResolvedValue(ownerSession);
    db.user.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        email: 'existing@example.com',
        password: 'password123',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await createWorkerRoute(req);
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body).toEqual({ error: 'Email already in use' });
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────────
  it('4. authorizeCredentials: deactivated user → returns null', async () => {
    mockCreateRatelimit.mockImplementation(() => ({
      limit: jest.fn().mockResolvedValue({ success: true }),
    }));
    db.user.findUnique.mockResolvedValue({
      id: 'worker-id',
      email: 'deactivated@example.com',
      passwordHash: 'hashed',
      name: 'Deactivated Worker',
      role: 'WORKER',
      isActive: false,
    });

    const result = await authorizeCredentials(
      { email: 'deactivated@example.com', password: 'password123' },
      { headers: {} }
    );

    expect(result).toBeNull();
  });

  // ── Test 5 ─────────────────────────────────────────────────────────────────
  it('5. PUT /api/users/me: wrong currentPassword → 400', async () => {
    mockGetServerSession.mockResolvedValue(workerSession);
    db.user.findUnique.mockResolvedValue({
      id: 'worker-id',
      email: 'worker@example.com',
      passwordHash: 'hashed',
      name: 'Worker',
      role: 'WORKER',
      isActive: true,
    });
    mockBcryptCompare.mockResolvedValue(false);

    const req = new NextRequest('http://localhost/api/users/me', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword123',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await updateMeRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body).toEqual({ error: 'Current password is incorrect' });
  });

  // ── Test 6 ─────────────────────────────────────────────────────────────────
  it('6. POST /api/auth/forgot-password: unknown email → 200 with generic message; same shape as known email', async () => {
    process.env.RESEND_FROM_EMAIL = 'noreply@example.com';

    // Unknown email
    db.user.findUnique.mockResolvedValue(null);

    const reqUnknown = new NextRequest('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'unknown@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const resUnknown = await forgotPasswordRoute(reqUnknown);
    expect(resUnknown.status).toBe(200);
    const bodyUnknown = await resUnknown.json() as { message: string };
    expect(bodyUnknown).toEqual({ message: 'If that email exists, a reset link has been sent.' });

    // Known email — same response shape
    db.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'known@example.com',
      passwordHash: 'hashed',
      name: 'Known User',
      role: 'WORKER',
      isActive: true,
    });
    db.verificationToken.create.mockResolvedValue({
      identifier: 'known@example.com',
      token: 'token_hash',
      expires: new Date(Date.now() + 3600 * 1000),
    });

    const reqKnown = new NextRequest('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'known@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const resKnown = await forgotPasswordRoute(reqKnown);
    expect(resKnown.status).toBe(200);
    const bodyKnown = await resKnown.json() as { message: string };
    expect(bodyKnown).toEqual({ message: 'If that email exists, a reset link has been sent.' });

    delete process.env.RESEND_FROM_EMAIL;
  });

  // ── Test 7 ─────────────────────────────────────────────────────────────────
  it('7. POST /api/auth/reset-password: valid token → 200 and token row deleted', async () => {
    const expires = new Date(Date.now() + 3600 * 1000);
    db.verificationToken.findFirst.mockResolvedValue({
      identifier: 'user@example.com',
      token: 'token_hash',
      expires,
    });
    db.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
    db.user.update.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: 'new_hash',
      name: 'User',
      role: 'WORKER',
      isActive: true,
    });

    const req = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'raw_token', password: 'newpassword123' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await resetPasswordRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body).toEqual({ message: 'Password updated. Please log in.' });
    expect(db.verificationToken.deleteMany).toHaveBeenCalled();
  });

  // ── Test 8 ─────────────────────────────────────────────────────────────────
  it('8. POST /api/auth/reset-password: expired/invalid token → 400', async () => {
    db.verificationToken.findFirst.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'expired_token', password: 'newpassword123' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await resetPasswordRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body).toEqual({ error: 'Invalid or expired reset link.' });
  });

  // ── Test 9 ─────────────────────────────────────────────────────────────────
  it('9. POST /api/users: unauthenticated request → 401', async () => {
    mockGetServerSession.mockResolvedValue(null);

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        email: 'test@example.com',
        password: 'password123',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await createWorkerRoute(req);
    expect(res.status).toBe(401);
  });

  // ── Test 10 ────────────────────────────────────────────────────────────────
  it('10. JWT role: WORKER calling OWNER-only route POST /api/users → 403', async () => {
    mockGetServerSession.mockResolvedValue(workerSession);

    const req = new NextRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        email: 'test@example.com',
        password: 'password123',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await createWorkerRoute(req);
    expect(res.status).toBe(403);
  });

  // ── Test 11 ────────────────────────────────────────────────────────────────
  it('11. PATCH /api/users/[id]/deactivate: target is OWNER → 403', async () => {
    mockGetServerSession.mockResolvedValue(ownerSession);
    db.user.findUnique.mockResolvedValue({
      id: 'another-owner-id',
      email: 'owner2@example.com',
      name: 'Another Owner',
      role: 'OWNER',
      isActive: true,
      passwordHash: 'hashed',
    });

    const req = new NextRequest('http://localhost/api/users/another-owner-id/deactivate', {
      method: 'PATCH',
    });

    const res = await deactivateWorkerRoute(req, { params: { id: 'another-owner-id' } });
    expect(res.status).toBe(403);
  });

  // ── Test 12 ────────────────────────────────────────────────────────────────
  it('12. PUT /api/users/[id]: target is OWNER → 403', async () => {
    mockGetServerSession.mockResolvedValue(ownerSession);
    db.user.findUnique.mockResolvedValue({
      id: 'another-owner-id',
      email: 'owner2@example.com',
      name: 'Another Owner',
      role: 'OWNER',
      isActive: true,
      passwordHash: 'hashed',
    });

    const req = new NextRequest('http://localhost/api/users/another-owner-id', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Name' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await updateWorkerRoute(req, { params: { id: 'another-owner-id' } });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Cannot modify another OWNER');
  });

  // ── Test 13 ────────────────────────────────────────────────────────────────
  it('13. POST /api/auth/forgot-password: rate limit exceeded → 429', async () => {
    mockCreateRatelimit.mockImplementation(() => ({
      limit: jest.fn().mockResolvedValue({ success: false }),
    }));

    const req = new NextRequest('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await forgotPasswordRoute(req);
    expect(res.status).toBe(429);
  });

  // ── Test 14 ────────────────────────────────────────────────────────────────
  it('14. POST /api/auth/reset-password: rate limit exceeded → 429', async () => {
    mockCreateRatelimit.mockImplementation(() => ({
      limit: jest.fn().mockResolvedValue({ success: false }),
    }));

    const req = new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'sometoken', password: 'newpassword123' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await resetPasswordRoute(req);
    expect(res.status).toBe(429);
  });

  // ── Test 15 ────────────────────────────────────────────────────────────────
  it('15. authorizeCredentials: user is null → bcrypt.compare called against DUMMY_HASH', async () => {
    mockCreateRatelimit.mockImplementation(() => ({
      limit: jest.fn().mockResolvedValue({ success: true }),
    }));
    db.user.findUnique.mockResolvedValue(null);
    mockBcryptCompare.mockResolvedValue(false);

    const result = await authorizeCredentials(
      { email: 'nobody@example.com', password: 'anypassword' },
      { headers: {} }
    );

    expect(result).toBeNull();
    expect(mockBcryptCompare).toHaveBeenCalledTimes(1);
    expect(mockBcryptCompare).toHaveBeenCalledWith('anypassword', DUMMY_HASH);
  });
});
