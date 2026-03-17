/** @jest-environment node */
import { Prisma, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth/next'
import type { CredentialsConfig } from 'next-auth/providers/credentials'
import { Resend } from 'resend'

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    verificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: jest.fn(),
    compare: jest.fn(),
  },
}))

import { POST as forgotPasswordPOST } from '@/app/api/auth/forgot-password/route'
import { POST as resetPasswordPOST } from '@/app/api/auth/reset-password/route'
import { PATCH as deactivateWorkerPATCH } from '@/app/api/users/[id]/deactivate/route'
import { PUT as updateWorkerPUT } from '@/app/api/users/[id]/route'
import { GET as usersMeGET, PUT as usersMePUT } from '@/app/api/users/me/route'
import { GET as usersGET, POST as usersPOST } from '@/app/api/users/route'
import { authOptions } from '@/lib/auth'
import { prisma as prismaClient } from '@/lib/prisma'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockBcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>
const mockBcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>
const mockPrisma = prismaClient as unknown as {
  user: {
    findMany: jest.Mock
    findUnique: jest.Mock
    create: jest.Mock
    update: jest.Mock
    count: jest.Mock
  }
  verificationToken: {
    create: jest.Mock
    findUnique: jest.Mock
    delete: jest.Mock
  }
  $transaction: jest.Mock
}

const ownerSession = {
  user: {
    id: 'owner-1',
    role: Role.OWNER,
    email: 'owner@example.com',
    name: 'Owner',
  },
}

const workerSession = {
  user: {
    id: 'worker-1',
    role: Role.WORKER,
    email: 'worker@example.com',
    name: 'Worker',
  },
}

function isCredentialsProvider(
  p: unknown,
): p is { authorize: NonNullable<CredentialsConfig['authorize']> } {
  return (
    typeof p === 'object' &&
    p !== null &&
    'type' in p &&
    (p as { type: string }).type === 'credentials' &&
    'authorize' in p &&
    typeof (p as { authorize: unknown }).authorize === 'function'
  )
}

function jsonRequest(url: string, method: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('auth module routes', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetServerSession.mockResolvedValue(ownerSession)
    mockBcryptHash.mockResolvedValue('hashed-value' as unknown as never)
    mockBcryptCompare.mockResolvedValue(true as unknown as never)
    mockPrisma.$transaction.mockImplementation(async (operations: unknown[]) => Promise.all(operations))
    process.env.RESEND_API_KEY = 'resend-key'
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    ;(Resend as unknown as jest.Mock).mockImplementation(() => ({
      emails: { send: mockSend },
    }))
    mockSend.mockResolvedValue({ id: 'email-1' })
  })

  it('POST /api/users: OWNER creates worker -> 201', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    mockPrisma.user.create.mockResolvedValue({
      id: 'worker-1',
      name: 'Worker One',
      email: 'worker1@example.com',
      role: Role.WORKER,
      isActive: true,
    })

    const response = await usersPOST(
      jsonRequest('http://localhost/api/users', 'POST', {
        name: 'Worker One',
        email: 'worker1@example.com',
        password: 'password123',
      }) as never,
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: 'worker-1',
      name: 'Worker One',
      email: 'worker1@example.com',
      role: Role.WORKER,
      isActive: true,
    })
  })

  it('POST /api/users: WORKER caller -> 403', async () => {
    mockGetServerSession.mockResolvedValue(workerSession)

    const response = await usersPOST(
      jsonRequest('http://localhost/api/users', 'POST', {
        name: 'Worker One',
        email: 'worker1@example.com',
        password: 'password123',
      }) as never,
    )

    expect(response.status).toBe(403)
  })

  it('POST /api/users: unauthenticated -> 401', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const response = await usersPOST(
      jsonRequest('http://localhost/api/users', 'POST', {
        name: 'Worker One',
        email: 'worker1@example.com',
        password: 'password123',
      }) as never,
    )

    expect(response.status).toBe(401)
  })

  it('POST /api/users: duplicate email -> 409', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing-worker' })

    const response = await usersPOST(
      jsonRequest('http://localhost/api/users', 'POST', {
        name: 'Worker One',
        email: 'worker1@example.com',
        password: 'password123',
      }) as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Email already in use' })
  })

  it('POST /api/users: duplicate email at create -> 409', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    mockPrisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      }),
    )

    const response = await usersPOST(
      jsonRequest('http://localhost/api/users', 'POST', {
        name: 'Worker One',
        email: 'duplicate@example.com',
        password: 'password123',
      }) as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Email already in use' })
  })

  it('POST /api/users: missing name -> 400 with field error', async () => {
    const response = await usersPOST(
      jsonRequest('http://localhost/api/users', 'POST', {
        email: 'worker1@example.com',
        password: 'password123',
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.any(String),
        field: 'name',
      }),
    )
  })

  it('POST /api/users: password too short -> 400', async () => {
    const response = await usersPOST(
      jsonRequest('http://localhost/api/users', 'POST', {
        name: 'Worker One',
        email: 'worker1@example.com',
        password: 'short',
      }) as never,
    )

    expect(response.status).toBe(400)
  })

  it('GET /api/users: OWNER -> 200', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'worker-1',
        name: 'Worker One',
        email: 'worker1@example.com',
        role: Role.WORKER,
        isActive: true,
      },
    ])

    const response = await usersGET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toHaveLength(1)
  })

  it('GET /api/users: WORKER -> 403', async () => {
    mockGetServerSession.mockResolvedValue(workerSession)

    const response = await usersGET()

    expect(response.status).toBe(403)
  })

  it('GET /api/users: unauthenticated -> 401', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const response = await usersGET()

    expect(response.status).toBe(401)
  })

  it('PUT /api/users/[id]: OWNER updates worker -> 200', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'worker-1',
        role: Role.WORKER,
        email: 'worker1@example.com',
      })
      .mockResolvedValueOnce(null)
    mockPrisma.user.update.mockResolvedValue({
      id: 'worker-1',
      name: 'Worker Updated',
      email: 'worker1@example.com',
      role: Role.WORKER,
      isActive: true,
    })

    const response = await updateWorkerPUT(
      jsonRequest('http://localhost/api/users/worker-1', 'PUT', { name: 'Worker Updated' }) as never,
      { params: { id: 'worker-1' } },
    )

    expect(response.status).toBe(200)
  })

  it('PUT /api/users/[id]: OWNER cannot update another OWNER -> 403', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'owner-2', role: Role.OWNER })

    const response = await updateWorkerPUT(
      jsonRequest('http://localhost/api/users/owner-2', 'PUT', { name: 'Nope' }) as never,
      { params: { id: 'owner-2' } },
    )

    expect(response.status).toBe(403)
  })

  it('PUT /api/users/[id]: target user not found -> 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const response = await updateWorkerPUT(
      jsonRequest('http://localhost/api/users/missing', 'PUT', { name: 'Nope' }) as never,
      { params: { id: 'missing' } },
    )

    expect(response.status).toBe(404)
  })

  it('PUT /api/users/[id]: WORKER caller -> 403', async () => {
    mockGetServerSession.mockResolvedValue(workerSession)

    const response = await updateWorkerPUT(
      jsonRequest('http://localhost/api/users/worker-1', 'PUT', { name: 'Worker Updated' }) as never,
      { params: { id: 'worker-1' } },
    )

    expect(response.status).toBe(403)
  })

  it('PATCH /api/users/[id]/deactivate: OWNER deactivates WORKER -> 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'worker-1', role: Role.WORKER })
    mockPrisma.user.update.mockResolvedValue({ id: 'worker-1', isActive: false })

    const response = await deactivateWorkerPATCH(new Request('http://localhost/api/users/worker-1/deactivate'), {
      params: { id: 'worker-1' },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 'worker-1', isActive: false })
  })

  it('PATCH /api/users/[id]/deactivate: OWNER cannot deactivate OWNER -> 403', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'owner-2', role: Role.OWNER })

    const response = await deactivateWorkerPATCH(new Request('http://localhost/api/users/owner-2/deactivate'), {
      params: { id: 'owner-2' },
    })

    expect(response.status).toBe(403)
  })

  it('PATCH /api/users/[id]/deactivate: WORKER caller -> 403', async () => {
    mockGetServerSession.mockResolvedValue(workerSession)

    const response = await deactivateWorkerPATCH(new Request('http://localhost/api/users/worker-1/deactivate'), {
      params: { id: 'worker-1' },
    })

    expect(response.status).toBe(403)
  })

  it('authorize callback rejects deactivated users', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'worker-1',
      name: 'Worker',
      email: 'worker@example.com',
      role: Role.WORKER,
      passwordHash: 'hash',
      isActive: false,
    })

    const provider = authOptions.providers[0]
    expect(isCredentialsProvider(provider)).toBe(true)
    if (!isCredentialsProvider(provider)) {
      throw new Error('Expected credentials provider')
    }
    const result = await provider.authorize(
      { email: 'worker@example.com', password: 'password123' },
      {} as never,
    )

    expect(result).toBeNull()
  })

  it('PUT /api/users/me: OWNER updates own name -> 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@example.com',
      passwordHash: 'hash',
      role: Role.OWNER,
      isActive: true,
    })
    mockPrisma.user.update.mockResolvedValue({
      id: 'owner-1',
      name: 'Owner Updated',
      email: 'owner@example.com',
    })

    const response = await usersMePUT(
      jsonRequest('http://localhost/api/users/me', 'PUT', { name: 'Owner Updated' }) as never,
    )

    expect(response.status).toBe(200)
  })

  it('PUT /api/users/me: password change with correct currentPassword -> 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@example.com',
      passwordHash: 'hash',
      role: Role.OWNER,
      isActive: true,
    })
    mockBcryptCompare.mockResolvedValue(true as unknown as never)
    mockPrisma.user.update.mockResolvedValue({
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@example.com',
    })

    const response = await usersMePUT(
      jsonRequest('http://localhost/api/users/me', 'PUT', {
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
      }) as never,
    )

    expect(response.status).toBe(200)
  })

  it('PUT /api/users/me: wrong currentPassword -> 400', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@example.com',
      passwordHash: 'hash',
      role: Role.OWNER,
      isActive: true,
    })
    mockBcryptCompare.mockResolvedValue(false as unknown as never)

    const response = await usersMePUT(
      jsonRequest('http://localhost/api/users/me', 'PUT', {
        currentPassword: 'wrong',
        newPassword: 'new-password-123',
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Current password is incorrect' })
  })

  it('PUT /api/users/me: unauthenticated -> 401', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const response = await usersMePUT(
      jsonRequest('http://localhost/api/users/me', 'PUT', { name: 'Owner Updated' }) as never,
    )

    expect(response.status).toBe(401)
  })

  it('PUT /api/users/me: email conflict -> 409', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'owner-1',
        name: 'Owner',
        email: 'owner@example.com',
        passwordHash: 'hash',
        role: Role.OWNER,
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: 'other-user',
        email: 'taken@example.com',
      })

    const response = await usersMePUT(
      jsonRequest('http://localhost/api/users/me', 'PUT', { email: 'taken@example.com' }) as never,
    )

    expect(response.status).toBe(409)
  })

  it('GET /api/users/me: authenticated user -> 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      name: 'Owner',
      email: 'owner@example.com',
    })

    const response = await usersMeGET()

    expect(response.status).toBe(200)
  })

  it('POST /api/auth/forgot-password: existing email -> 200 and sends email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: Role.OWNER,
      passwordHash: 'hash',
      isActive: true,
    })
    mockPrisma.verificationToken.create.mockResolvedValue({})
    mockSend.mockResolvedValue({ id: 'email-1' })

    const response = await forgotPasswordPOST(
      jsonRequest('http://localhost/api/auth/forgot-password', 'POST', { email: 'owner@example.com' }) as never,
    )

    expect(response.status).toBe(200)
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('POST /api/auth/forgot-password: unknown email -> 200 and no resend call', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const response = await forgotPasswordPOST(
      jsonRequest('http://localhost/api/auth/forgot-password', 'POST', { email: 'missing@example.com' }) as never,
    )

    expect(response.status).toBe(200)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('POST /api/auth/forgot-password: resend throws -> 500 generic message', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: Role.OWNER,
      passwordHash: 'hash',
      isActive: true,
    })
    mockPrisma.verificationToken.create.mockResolvedValue({})
    mockSend.mockRejectedValue(new Error('resend failed'))

    const response = await forgotPasswordPOST(
      jsonRequest('http://localhost/api/auth/forgot-password', 'POST', { email: 'owner@example.com' }) as never,
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to send email. Try again.' })
  })

  it('POST /api/auth/reset-password: valid token -> 200 and token deleted', async () => {
    mockPrisma.verificationToken.findUnique.mockResolvedValue({
      identifier: 'owner-1',
      token: 'hashed-token',
      expires: new Date(Date.now() + 1000 * 60),
    })
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: Role.OWNER,
      passwordHash: 'old-hash',
      isActive: true,
    })
    mockPrisma.user.update.mockResolvedValue({})
    mockPrisma.verificationToken.delete.mockResolvedValue({})

    const response = await resetPasswordPOST(
      jsonRequest('http://localhost/api/auth/reset-password', 'POST', {
        token: 'raw-token',
        password: 'new-password-123',
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(mockPrisma.verificationToken.delete).toHaveBeenCalledTimes(1)
  })

  it('POST /api/auth/reset-password: token not found -> 400', async () => {
    mockPrisma.verificationToken.findUnique.mockResolvedValue(null)

    const response = await resetPasswordPOST(
      jsonRequest('http://localhost/api/auth/reset-password', 'POST', {
        token: 'missing-token',
        password: 'new-password-123',
      }) as never,
    )

    expect(response.status).toBe(400)
  })

  it('POST /api/auth/reset-password: expired token -> 400', async () => {
    mockPrisma.verificationToken.findUnique.mockResolvedValue({
      identifier: 'owner-1',
      token: 'hashed-token',
      expires: new Date(Date.now() - 1000),
    })

    const response = await resetPasswordPOST(
      jsonRequest('http://localhost/api/auth/reset-password', 'POST', {
        token: 'expired-token',
        password: 'new-password-123',
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid or expired reset link.' })
  })

  it('jwt callback includes role and id from user', async () => {
    const jwt = authOptions.callbacks?.jwt

    expect(jwt).toBeDefined()

    const token = await jwt?.({
      token: { sub: 'worker-1' },
      user: {
        id: 'worker-1',
        role: Role.WORKER,
        email: 'worker@example.com',
        name: 'Worker',
      },
    } as never)

    expect(token).toEqual(expect.objectContaining({ id: 'worker-1', role: Role.WORKER }))
  })

  it('session callback propagates role and id to session.user', async () => {
    const session = authOptions.callbacks?.session

    expect(session).toBeDefined()

    const value = await session?.({
      session: {
        user: {
          name: 'Worker',
          email: 'worker@example.com',
          image: null,
        },
        expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      token: {
        id: 'worker-1',
        role: Role.WORKER,
      },
    } as never)

    expect(value?.user).toEqual(
      expect.objectContaining({
        id: 'worker-1',
        role: Role.WORKER,
      }),
    )
  })
})
