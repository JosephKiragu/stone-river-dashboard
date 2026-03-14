import bcrypt from 'bcryptjs'
import type { Session } from 'next-auth'
import { getServerSession } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    verificationToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/resend', () => ({
  resend: {
    emails: {
      send: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  __esModule: true,
  getServerSession: jest.fn(),
}))

import { POST as forgotPasswordPost } from '@/app/api/auth/forgot-password/route'
import { POST as resetPasswordPost } from '@/app/api/auth/reset-password/route'
import { POST as usersPost } from '@/app/api/users/route'
import { authOptions, authorizeCredentials } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resend } from '@/lib/resend'
import { userService } from '@/services/user.service'

type PrismaMock = {
  user: {
    findUnique: jest.Mock
    findMany: jest.Mock
    create: jest.Mock
    update: jest.Mock
  }
  verificationToken: {
    findUnique: jest.Mock
    create: jest.Mock
    delete: jest.Mock
    deleteMany: jest.Mock
  }
}

const mockPrisma = prisma as unknown as PrismaMock
const mockResendSend = resend.emails.send as unknown as jest.Mock

jest.setTimeout(20000)

describe('Auth module', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.RESEND_FROM_EMAIL = 'noreply@example.com'
    process.env.NEXTAUTH_SECRET = 'secret'
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
  })

  it('1) POST /api/users: OWNER creates worker and worker can log in', async () => {
    const password = 'workerpass123'
    const passwordHash = await bcrypt.hash(password, 4)

    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    mockPrisma.user.create.mockResolvedValue({
      id: 'worker-1',
      email: 'worker@example.com',
      name: 'Worker One',
      role: 'WORKER',
      isActive: true,
    })

    const worker = await userService.createWorker({
      name: 'Worker One',
      email: 'worker@example.com',
      password,
    })

    expect(worker.role).toBe('WORKER')

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'worker-1',
      email: 'worker@example.com',
      name: 'Worker One',
      role: 'WORKER',
      isActive: true,
      passwordHash,
    })

    const authorized = await authorizeCredentials({ email: 'worker@example.com', password })

    expect(authorized).toEqual(
      expect.objectContaining({
        id: 'worker-1',
        role: 'WORKER',
      }),
    )
  })

  it('2) POST /api/users: WORKER calls endpoint -> 403', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { id: 'u1', role: 'WORKER', isActive: true },
    } as Session)

    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'W', email: 'w@example.com', password: 'password123' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await usersPost(request as unknown as NextRequest)
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('3) duplicate email -> 409 (pre-check and P2002 path)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing' })

    await expect(
      userService.createWorker({
        name: 'Worker',
        email: 'exists@example.com',
        password: 'password123',
      }),
    ).rejects.toMatchObject({ status: 409, message: 'Email already in use' })

    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    mockPrisma.user.create.mockRejectedValueOnce({ code: 'P2002' })

    await expect(
      userService.createWorker({
        name: 'Worker',
        email: 'race@example.com',
        password: 'password123',
      }),
    ).rejects.toMatchObject({ status: 409, message: 'Email already in use' })
  })

  it('4) deactivated worker cannot authenticate', async () => {
    const password = 'workerpass123'
    const passwordHash = await bcrypt.hash(password, 4)

    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 'worker-1', role: 'WORKER' })
      .mockResolvedValueOnce({
        id: 'worker-1',
        email: 'worker@example.com',
        name: 'Worker One',
        role: 'WORKER',
        isActive: false,
        passwordHash,
      })

    mockPrisma.user.update.mockResolvedValue({ id: 'worker-1', isActive: false })

    await userService.deactivateWorker('worker-1')

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'worker-1',
      email: 'worker@example.com',
      name: 'Worker One',
      role: 'WORKER',
      isActive: false,
      passwordHash,
    })

    const authorized = await authorizeCredentials({ email: 'worker@example.com', password })
    expect(authorized).toBeNull()
  })

  it('5) PUT /api/users/me wrong currentPassword -> 400', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4)

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'OWNER',
      isActive: true,
      passwordHash,
    })

    await expect(
      userService.updateSelf('owner-1', {
        currentPassword: 'wrong-password',
        newPassword: 'new-password-123',
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Current password is incorrect' })
  })

  it('6) POST /api/auth/forgot-password unknown email -> 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    const request = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: 'unknown@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await forgotPasswordPost(request as unknown as NextRequest)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ message: 'If that email exists, a reset link has been sent.' })
  })

  it('7) POST /api/auth/reset-password valid token updates password and deletes token', async () => {
    const newPasswordHash = await bcrypt.hash('new-password-123', 4)

    mockPrisma.verificationToken.findUnique.mockResolvedValue({
      identifier: 'worker@example.com',
      token: 'valid-token',
      expires: new Date(Date.now() + 60 * 1000),
    })

    mockPrisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'worker-1',
        email: 'worker@example.com',
        name: 'Worker',
        role: 'WORKER',
        isActive: true,
        passwordHash: await bcrypt.hash('old-password-123', 4),
      })
      .mockResolvedValueOnce({
        id: 'worker-1',
        email: 'worker@example.com',
        name: 'Worker',
        role: 'WORKER',
        isActive: true,
        passwordHash: newPasswordHash,
      })

    mockPrisma.user.update.mockResolvedValue({ id: 'worker-1' })
    mockPrisma.verificationToken.delete.mockResolvedValue({ token: 'valid-token' })

    const request = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid-token', password: 'new-password-123' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await resetPasswordPost(request as unknown as NextRequest)

    expect(response.status).toBe(200)
    expect(mockPrisma.verificationToken.delete).toHaveBeenCalledWith({ where: { token: 'valid-token' } })

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'worker-1',
      email: 'worker@example.com',
      name: 'Worker',
      role: 'WORKER',
      isActive: true,
      passwordHash: newPasswordHash,
    })

    const authorized = await authorizeCredentials({
      email: 'worker@example.com',
      password: 'new-password-123',
    })

    expect(authorized).toEqual(expect.objectContaining({ id: 'worker-1' }))
  })

  it('8) POST /api/auth/reset-password expired token -> 400', async () => {
    mockPrisma.verificationToken.findUnique.mockResolvedValue({
      identifier: 'worker@example.com',
      token: 'expired-token',
      expires: new Date(Date.now() - 60 * 1000),
    })

    const request = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: 'expired-token', password: 'new-password-123' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await resetPasswordPost(request as unknown as NextRequest)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid or expired reset link.' })
  })

  it('9) POST /api/users unauthenticated -> 401', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'W', email: 'w@example.com', password: 'password123' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await usersPost(request as unknown as NextRequest)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('10) JWT role claim present and WORKER blocked from OWNER route', async () => {
    const jwtResult = await authOptions.callbacks?.jwt?.(
      {
        token: {} as JWT,
        user: {
          id: 'worker-2',
          role: 'WORKER',
          isActive: true,
        },
        account: null,
        profile: undefined,
        trigger: 'signIn',
        isNewUser: false,
        session: null,
      } as unknown as Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>['jwt']>>[0],
    )

    expect(jwtResult).toEqual(
      expect.objectContaining({
        id: 'worker-2',
        role: 'WORKER',
        isActive: true,
      }),
    )

    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: { id: 'worker-2', role: 'WORKER', isActive: true },
    } as Session)

    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'W', email: 'w2@example.com', password: 'password123' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await usersPost(request as unknown as NextRequest)
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('forgotPassword deletes old tokens and checks email send call', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'worker-1', email: 'worker@example.com' })
    mockPrisma.verificationToken.deleteMany.mockResolvedValue({ count: 1 })
    mockPrisma.verificationToken.create.mockResolvedValue({ token: 'new-token' })
    mockResendSend.mockResolvedValue({ id: 'email_123' })

    const result = await userService.forgotPassword('worker@example.com')

    expect(result).toEqual({ message: 'If that email exists, a reset link has been sent.' })
    expect(mockPrisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: 'worker@example.com' },
    })
    expect(mockPrisma.verificationToken.create).toHaveBeenCalled()
    expect(mockResendSend).toHaveBeenCalled()
  })
})
