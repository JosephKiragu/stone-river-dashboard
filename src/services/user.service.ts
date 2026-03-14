import { hash, compare } from 'bcryptjs'
import { Role, type User } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { resend } from '@/lib/resend'

const bcryptRounds = 12
const resetExpiryMs = 60 * 60 * 1000

export const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

export const updateWorkerSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
  })
  .refine((data) => data.name || data.email || data.password, {
    message: 'At least one field is required',
    path: ['name'],
  })

export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>

export const selfUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    currentPassword: z.string().min(8).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .refine((data) => data.name || data.email || data.newPassword, {
    message: 'At least one field is required',
    path: ['name'],
  })
  .refine((data) => !data.newPassword || Boolean(data.currentPassword), {
    message: 'Current password is required when changing password',
    path: ['currentPassword'],
  })

export type SelfUpdateInput = z.infer<typeof selfUpdateSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly field?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const toUserResponse = (user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'isActive'>) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
})

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

const ensureOwner = (role: Role | undefined): void => {
  if (role !== 'OWNER') {
    throw new AppError('FORBIDDEN', 'Forbidden')
  }
}

export const createWorker = async (
  actorRole: Role | undefined,
  input: CreateUserInput,
): Promise<ReturnType<typeof toUserResponse>> => {
  ensureOwner(actorRole)

  const email = normalizeEmail(input.email)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new AppError('CONFLICT', 'Email already in use')
  }

  const passwordHash = await hash(input.password, bcryptRounds)

  const created = await prisma.user.create({
    data: {
      name: input.name,
      email,
      passwordHash,
      role: 'WORKER',
      isActive: true,
    },
  })

  return toUserResponse(created)
}

export const updateWorker = async (
  actorRole: Role | undefined,
  userId: string,
  input: UpdateWorkerInput,
): Promise<ReturnType<typeof toUserResponse>> => {
  ensureOwner(actorRole)

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) {
    throw new AppError('NOT_FOUND', 'User not found')
  }

  if (target.role === 'OWNER') {
    throw new AppError('FORBIDDEN', 'Cannot modify another OWNER')
  }

  const nextEmail = input.email ? normalizeEmail(input.email) : undefined
  if (nextEmail && nextEmail !== target.email) {
    const duplicate = await prisma.user.findUnique({ where: { email: nextEmail } })
    if (duplicate) {
      throw new AppError('CONFLICT', 'Email already in use')
    }
  }

  const updates: {
    name?: string
    email?: string
    passwordHash?: string
  } = {}

  if (input.name) {
    updates.name = input.name
  }
  if (nextEmail) {
    updates.email = nextEmail
  }
  if (input.password) {
    updates.passwordHash = await hash(input.password, bcryptRounds)
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: updates,
  })

  return toUserResponse(updated)
}

export const deactivateWorker = async (
  actorRole: Role | undefined,
  userId: string,
): Promise<{ id: string; isActive: false }> => {
  ensureOwner(actorRole)

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) {
    throw new AppError('NOT_FOUND', 'User not found')
  }

  if (target.role === 'OWNER') {
    throw new AppError('FORBIDDEN', 'Cannot deactivate an OWNER')
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { isActive: false },
  })

  return { id: updated.id, isActive: false }
}

export const updateSelf = async (
  userId: string,
  input: SelfUpdateInput,
): Promise<{ id: string; name: string; email: string }> => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found')
  }

  const updates: {
    name?: string
    email?: string
    passwordHash?: string
  } = {}

  if (input.name) {
    updates.name = input.name
  }

  if (input.email) {
    const email = normalizeEmail(input.email)
    if (email !== user.email) {
      const duplicate = await prisma.user.findUnique({ where: { email } })
      if (duplicate) {
        throw new AppError('CONFLICT', 'Email already in use')
      }
    }
    updates.email = email
  }

  if (input.newPassword) {
    if (!input.currentPassword) {
      throw new AppError('BAD_REQUEST', 'Current password is required when changing password', 'currentPassword')
    }

    const passwordMatches = await compare(input.currentPassword, user.passwordHash)
    if (!passwordMatches) {
      throw new AppError('BAD_REQUEST', 'Current password is incorrect')
    }

    updates.passwordHash = await hash(input.newPassword, bcryptRounds)
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: updates,
  })

  return { id: updated.id, name: updated.name, email: updated.email }
}

const buildResetUrl = (token: string): string => {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`
}

export const forgotPassword = async (input: ForgotPasswordInput): Promise<void> => {
  const email = normalizeEmail(input.email)

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return
  }

  const token = crypto.randomUUID()
  const expires = new Date(Date.now() + resetExpiryMs)

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  })

  const from = process.env.RESEND_FROM_EMAIL
  if (!from) {
    throw new AppError('INTERNAL_ERROR', 'Failed to send email. Try again.')
  }

  try {
    await resend.emails.send({
      from,
      to: email,
      subject: 'Reset your Feedlot Dashboard password',
      text: `Use this link to reset your password: ${buildResetUrl(token)}`,
    })
  } catch {
    throw new AppError('INTERNAL_ERROR', 'Failed to send email. Try again.')
  }
}

export const resetPassword = async (input: ResetPasswordInput): Promise<void> => {
  const tokenRow = await prisma.verificationToken.findUnique({
    where: { token: input.token },
  })

  if (!tokenRow || tokenRow.expires.getTime() <= Date.now()) {
    throw new AppError('BAD_REQUEST', 'Invalid or expired reset link.')
  }

  const user = await prisma.user.findUnique({
    where: { email: tokenRow.identifier.toLowerCase() },
  })

  if (!user) {
    throw new AppError('BAD_REQUEST', 'Invalid or expired reset link.')
  }

  const passwordHash = await hash(input.password, bcryptRounds)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.verificationToken.delete({
      where: { token: tokenRow.token },
    }),
  ])
}
