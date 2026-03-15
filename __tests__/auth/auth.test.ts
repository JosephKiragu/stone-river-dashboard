import bcrypt from 'bcryptjs'

import { authorizeCredentials, DUMMY_HASH } from '@/lib/auth'
import { POST as createUserRoute } from '@/app/api/users/route'
import { PUT as updateUserRoute } from '@/app/api/users/[id]/route'
import { PATCH as deactivateRoute } from '@/app/api/users/[id]/deactivate/route'
import { PUT as meRoute } from '@/app/api/users/me/route'
import { POST as forgotPasswordRoute } from '@/app/api/auth/forgot-password/route'
import { POST as resetPasswordRoute } from '@/app/api/auth/reset-password/route'

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    verificationToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/ratelimit', () => ({
  isRateLimited: jest.fn(),
}))

jest.mock('@/lib/resend', () => ({
  getResendClient: jest.fn(),
}))

const { getServerSession } = jest.requireMock('next-auth/next') as {
  getServerSession: jest.Mock
}

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    user: {
      findUnique: jest.Mock
      create: jest.Mock
      update: jest.Mock
    }
    verificationToken: {
      findUnique: jest.Mock
      create: jest.Mock
      deleteMany: jest.Mock
    }
  }
}

const { isRateLimited } = jest.requireMock('@/lib/ratelimit') as {
  isRateLimited: jest.Mock
}

const { getResendClient } = jest.requireMock('@/lib/resend') as {
  getResendClient: jest.Mock
}

const ownerSession = {
  user: {
    id: 'owner-1',
    role: 'OWNER',
    isActive: true,
    name: 'Owner',
    email: 'owner@example.com',
  },
}

const workerSession = {
  user: {
    id: 'worker-1',
    role: 'WORKER',
    isActive: true,
    name: 'Worker',
    email: 'worker@example.com',
  },
}

describe('auth module routes and auth helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    isRateLimited.mockResolvedValue(false)
    getResendClient.mockReturnValue(null)
  })

  it('POST /api/users owner create worker then authorizeCredentials roundtrip', async () => {
    getServerSession.mockResolvedValue(ownerSession)

    const password = 'secret123'
    const hash = await bcrypt.hash(password, 12)

    prisma.user.create.mockResolvedValue({
      id: 'worker-123',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'WORKER',
      isActive: true,
    })

    prisma.user.findUnique.mockResolvedValue({
      id: 'worker-123',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'WORKER',
      isActive: true,
      passwordHash: hash,
    })

    const response = await createUserRoute(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Alice',
          email: 'alice@example.com',
          password,
        }),
      }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: 'worker-123',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'WORKER',
      isActive: true,
    })

    const authResult = await authorizeCredentials(
      { email: 'alice@example.com', password },
    )

    expect(authResult).not.toBeNull()
  })

  it('POST /api/users returns 403 for WORKER caller', async () => {
    getServerSession.mockResolvedValue(workerSession)

    const response = await createUserRoute(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Worker Name',
          email: 'w@example.com',
          password: 'secret123',
        }),
      }),
    )

    expect(response.status).toBe(403)
  })

  it('POST /api/users duplicate email returns 409', async () => {
    getServerSession.mockResolvedValue(ownerSession)
    prisma.user.create.mockRejectedValue({ code: 'P2002' })

    const response = await createUserRoute(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'secret123',
        }),
      }),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Email already in use' })
  })

  it('authorizeCredentials returns null for deactivated user', async () => {
    const password = 'secret123'
    const hash = await bcrypt.hash(password, 12)

    prisma.user.findUnique.mockResolvedValue({
      id: 'worker-123',
      name: 'Alice',
      email: 'alice@example.com',
      role: 'WORKER',
      isActive: false,
      passwordHash: hash,
    })

    const result = await authorizeCredentials(
      { email: 'alice@example.com', password },
    )

    expect(result).toBeNull()
  })

  it('PUT /api/users/me wrong currentPassword returns 400', async () => {
    getServerSession.mockResolvedValue(workerSession)

    const hash = await bcrypt.hash('old-pass-123', 12)
    prisma.user.findUnique.mockResolvedValue({
      id: 'worker-1',
      name: 'Worker',
      email: 'worker@example.com',
      role: 'WORKER',
      isActive: true,
      passwordHash: hash,
    })

    const response = await meRoute(
      new Request('http://localhost/api/users/me', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'wrong-pass-123',
          newPassword: 'new-pass-123',
        }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Current password is incorrect',
    })
  })

  it('POST /api/auth/forgot-password unknown and known email return identical 200 response', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null)

    const unknownResponse = await forgotPasswordRoute(
      new Request('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'unknown@example.com' }),
      }),
    )

    const unknownBody = await unknownResponse.json()
    expect(unknownResponse.status).toBe(200)

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'known@example.com',
      name: 'Known',
      role: 'WORKER',
      isActive: true,
      passwordHash: 'hash',
    })
    prisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 })
    prisma.verificationToken.create.mockResolvedValue({
      identifier: 'known@example.com',
      token: 'token-hash',
      expires: new Date(),
    })

    const knownResponse = await forgotPasswordRoute(
      new Request('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'known@example.com' }),
      }),
    )

    expect(knownResponse.status).toBe(200)
    await expect(knownResponse.json()).resolves.toEqual(unknownBody)
  })

  it('POST /api/auth/reset-password valid token updates password and deletes token', async () => {
    prisma.verificationToken.findUnique.mockResolvedValue({
      identifier: 'worker@example.com',
      token: 'token-hash',
      expires: new Date(Date.now() + 60_000),
    })
    prisma.verificationToken.deleteMany.mockResolvedValue({ count: 1 })
    prisma.user.update.mockResolvedValue({ id: 'worker-1' })

    const response = await resetPasswordRoute(
      new Request('http://localhost/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'raw-token', password: 'new-pass-123' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalled()
  })

  it('POST /api/auth/reset-password missing token returns 400', async () => {
    prisma.verificationToken.findUnique.mockResolvedValue(null)

    const response = await resetPasswordRoute(
      new Request('http://localhost/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'missing-token', password: 'new-pass-123' }),
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid or expired reset link.',
    })
  })

  it('POST /api/users unauthenticated request returns 401', async () => {
    getServerSession.mockResolvedValue(null)

    const response = await createUserRoute(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Alice User',
          email: 'a@example.com',
          password: 'secret123',
        }),
      }),
    )

    expect(response.status).toBe(401)
  })

  it('JWT role enforcement blocks WORKER on OWNER-only route', async () => {
    getServerSession.mockResolvedValue(workerSession)

    const response = await createUserRoute(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Another User',
          email: 'another@example.com',
          password: 'secret123',
        }),
      }),
    )

    expect(response.status).toBe(403)
  })

  it('PATCH /api/users/[id]/deactivate target OWNER returns 403', async () => {
    getServerSession.mockResolvedValue(ownerSession)
    prisma.user.findUnique.mockResolvedValue({
      id: 'owner-2',
      role: 'OWNER',
      email: 'owner2@example.com',
      name: 'Owner 2',
      isActive: true,
      passwordHash: 'hash',
    })

    const response = await deactivateRoute(
      new Request('http://localhost/api/users/owner-2/deactivate', {
        method: 'PATCH',
      }),
      { params: { id: 'owner-2' } },
    )

    expect(response.status).toBe(403)
  })

  it('PUT /api/users/[id] target OWNER returns 403 with correct body', async () => {
    getServerSession.mockResolvedValue(ownerSession)
    prisma.user.findUnique.mockResolvedValue({
      id: 'owner-2',
      role: 'OWNER',
      email: 'owner2@example.com',
      name: 'Owner 2',
      isActive: true,
      passwordHash: 'hash',
    })

    const response = await updateUserRoute(
      new Request('http://localhost/api/users/owner-2', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Changed Name' }),
      }),
      { params: { id: 'owner-2' } },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Cannot modify another OWNER',
    })
  })

  it('POST /api/auth/forgot-password rate limit exceeded returns 429', async () => {
    isRateLimited.mockResolvedValueOnce(true)

    const response = await forgotPasswordRoute(
      new Request('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'known@example.com' }),
      }),
    )

    expect(response.status).toBe(429)
  })

  it('POST /api/auth/reset-password rate limit exceeded returns 429', async () => {
    isRateLimited.mockResolvedValueOnce(true)

    const response = await resetPasswordRoute(
      new Request('http://localhost/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'raw-token', password: 'new-pass-123' }),
      }),
    )

    expect(response.status).toBe(429)
  })

  it('authorizeCredentials uses DUMMY_HASH when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const compareSpy = jest.spyOn(bcrypt, 'compare')

    const result = await authorizeCredentials(
      { email: 'missing@example.com', password: 'secret123' },
    )

    expect(result).toBeNull()
    expect(compareSpy).toHaveBeenCalledTimes(1)
    expect(compareSpy).toHaveBeenCalledWith('secret123', DUMMY_HASH)
  })
})
