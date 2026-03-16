import { Prisma, Role, User } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { Resend } from 'resend'
import { z } from 'zod'

import { AppError } from '@/lib/errors'
import { prisma } from '@/lib/prisma'

const createWorkerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
})

const updateWorkerSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
    path: ['body'],
  })

const updateOwnProfileSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .refine(
    (payload) => {
      if (payload.newPassword) {
        return Boolean(payload.currentPassword)
      }

      return true
    },
    {
      message: 'currentPassword is required when changing password',
      path: ['currentPassword'],
    },
  )
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
    path: ['body'],
  })

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

type PublicWorker = Pick<User, 'id' | 'name' | 'email' | 'role' | 'isActive'>
const CUID_REGEX = /^c[a-z0-9]{24}$/

function assertValidCuid(id: string): void {
  if (!CUID_REGEX.test(id)) {
    throw new AppError('Invalid id', 400)
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function appErrorFromZod(error: z.ZodError): AppError {
  const issue = error.issues[0]
  const field = issue?.path.join('.') || 'body'

  return new AppError(issue?.message ?? 'Invalid request payload', 400, field)
}

export async function listWorkers(): Promise<PublicWorker[]> {
  return prisma.user.findMany({
    where: { role: Role.WORKER },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createWorker(input: unknown): Promise<PublicWorker> {
  const parsed = createWorkerSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })

  if (existing) {
    throw new AppError('Email already in use', 409)
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)

  try {
    return prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: Role.WORKER,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('Email already in use', 409)
    }

    throw error
  }
}

export async function updateWorker(id: string, input: unknown): Promise<PublicWorker> {
  assertValidCuid(id)

  const parsed = updateWorkerSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const target = await prisma.user.findUnique({ where: { id } })

  if (!target) {
    throw new AppError('User not found', 404)
  }

  if (target.role !== Role.WORKER) {
    throw new AppError('Cannot modify another OWNER', 403)
  }

  if (parsed.data.email && parsed.data.email !== target.email) {
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })

    if (existing) {
      throw new AppError('Email already in use', 409)
    }
  }

  try {
    return prisma.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        ...(parsed.data.password ? { passwordHash: await bcrypt.hash(parsed.data.password, 12) } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('Email already in use', 409)
    }

    throw error
  }
}

export async function deactivateWorker(id: string): Promise<Pick<User, 'id' | 'isActive'>> {
  assertValidCuid(id)

  const target = await prisma.user.findUnique({ where: { id } })

  if (!target) {
    throw new AppError('User not found', 404)
  }

  if (target.role !== Role.WORKER) {
    throw new AppError('Cannot deactivate an OWNER', 403)
  }

  return prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, isActive: true },
  })
}

export async function getOwnProfile(userId: string): Promise<Pick<User, 'id' | 'name' | 'email'>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  })

  if (!user) {
    throw new AppError('User not found', 404)
  }

  return user
}

export async function updateOwnProfile(
  userId: string,
  input: unknown,
): Promise<Pick<User, 'id' | 'name' | 'email'>> {
  const parsed = updateOwnProfileSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })

  if (!user) {
    throw new AppError('User not found', 404)
  }

  if (parsed.data.email && parsed.data.email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })

    if (existing) {
      throw new AppError('Email already in use', 409)
    }
  }

  if (parsed.data.newPassword) {
    const isValidPassword = await bcrypt.compare(parsed.data.currentPassword ?? '', user.passwordHash)

    if (!isValidPassword) {
      throw new AppError('Current password is incorrect', 400)
    }
  }

  try {
    return prisma.user.update({
      where: { id: userId },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        ...(parsed.data.newPassword
          ? { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError('Email already in use', 409)
    }

    throw error
  }
}

export async function forgotPassword(input: unknown): Promise<{ message: string }> {
  const parsed = forgotPasswordSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })

  const rawToken = crypto.randomUUID()
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

  if (user) {
    let tokenPersisted = false

    try {
      await prisma.verificationToken.create({
        data: {
          identifier: user.id,
          token: hashedToken,
          expires: expiresAt,
        },
      })
      tokenPersisted = true

      const apiKey = process.env.RESEND_API_KEY

      if (!apiKey) {
        throw new Error('missing resend key')
      }

      const resend = new Resend(apiKey)
      const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
      const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'noreply@feedlot.local',
        to: user.email,
        subject: 'Reset your Feedlot password',
        text: `Use this link to reset your password: ${resetUrl}`,
      })
    } catch {
      if (tokenPersisted) {
        try {
          await prisma.verificationToken.delete({ where: { token: hashedToken } })
        } catch {
          // noop: surface original email failure
        }
      }

      throw new AppError('Failed to send email. Try again.', 500)
    }
  }

  return { message: 'If that email exists, a reset link has been sent.' }
}

export async function resetPassword(input: unknown): Promise<{ message: string }> {
  const parsed = resetPasswordSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const hashedToken = crypto.createHash('sha256').update(parsed.data.token).digest('hex')
  const tokenRecord = await prisma.verificationToken.findUnique({
    where: { token: hashedToken },
  })

  if (!tokenRecord || tokenRecord.expires <= new Date()) {
    throw new AppError('Invalid or expired reset link.', 400)
  }

  const user = await prisma.user.findUnique({ where: { id: tokenRecord.identifier } })

  if (!user) {
    throw new AppError('Invalid or expired reset link.', 400)
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.verificationToken.delete({ where: { token: hashedToken } }),
  ])

  return { message: 'Password updated. Please log in.' }
}
