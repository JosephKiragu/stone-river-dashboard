import crypto from 'crypto'

import bcrypt from 'bcryptjs'
import type { Prisma, Role } from '@prisma/client'

import { appError } from '@/lib/errors'
import { prisma } from '@/lib/prisma'
import { resend } from '@/lib/resend'

type WorkerPayload = {
  name: string
  email: string
  password: string
}

type WorkerUpdatePayload = {
  name?: string
  email?: string
  password?: string
}

type SelfUpdatePayload = {
  name?: string
  email?: string
  currentPassword?: string
  newPassword?: string
}

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect

type PublicUser = {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
}

const isPrismaUniqueConstraintError = (error: unknown): error is { code: string } => {
  if (!error || typeof error !== 'object') {
    return false
  }

  return (error as { code?: unknown }).code === 'P2002'
}

export const userService = {
  async listWorkers(): Promise<PublicUser[]> {
    return prisma.user.findMany({
      where: { role: 'WORKER' },
      orderBy: { createdAt: 'desc' },
      select: publicUserSelect,
    })
  },

  async createWorker(payload: WorkerPayload): Promise<PublicUser> {
    const existing = await prisma.user.findUnique({ where: { email: payload.email } })
    if (existing) {
      throw appError('CONFLICT', 'Email already in use')
    }

    const passwordHash = await bcrypt.hash(payload.password, 12)

    try {
      return await prisma.user.create({
        data: {
          name: payload.name,
          email: payload.email,
          passwordHash,
          role: 'WORKER',
          isActive: true,
        },
        select: publicUserSelect,
      })
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw appError('CONFLICT', 'Email already in use')
      }
      throw error
    }
  },

  async updateWorker(id: string, payload: WorkerUpdatePayload): Promise<PublicUser> {
    const worker = await prisma.user.findUnique({ where: { id } })
    if (!worker) {
      throw appError('NOT_FOUND', 'User not found')
    }

    if (worker.role === 'OWNER') {
      throw appError('FORBIDDEN', 'Cannot modify another OWNER')
    }

    const data: Prisma.UserUpdateInput = {
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.email ? { email: payload.email } : {}),
    }

    if (payload.password) {
      data.passwordHash = await bcrypt.hash(payload.password, 12)
    }

    try {
      return await prisma.user.update({
        where: { id },
        data,
        select: publicUserSelect,
      })
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw appError('CONFLICT', 'Email already in use')
      }
      throw error
    }
  },

  async deactivateWorker(id: string): Promise<{ id: string; isActive: boolean }> {
    const worker = await prisma.user.findUnique({ where: { id } })
    if (!worker) {
      throw appError('NOT_FOUND', 'User not found')
    }

    if (worker.role === 'OWNER') {
      throw appError('FORBIDDEN', 'Cannot deactivate an OWNER')
    }

    return prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        isActive: true,
      },
    })
  },

  async updateSelf(userId: string, payload: SelfUpdatePayload): Promise<Pick<PublicUser, 'id' | 'name' | 'email'>> {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw appError('NOT_FOUND', 'User not found')
    }

    const data: Prisma.UserUpdateInput = {
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.email ? { email: payload.email } : {}),
    }

    if (payload.newPassword) {
      if (!payload.currentPassword) {
        throw appError('BAD_REQUEST', 'Current password is required')
      }

      const matches = await bcrypt.compare(payload.currentPassword, user.passwordHash)
      if (!matches) {
        throw appError('BAD_REQUEST', 'Current password is incorrect')
      }

      data.passwordHash = await bcrypt.hash(payload.newPassword, 12)
    }

    try {
      return await prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          name: true,
          email: true,
        },
      })
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        throw appError('CONFLICT', 'Email already in use')
      }
      throw error
    }
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    const message = 'If that email exists, a reset link has been sent.'

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return { message }
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL
    if (!fromEmail) {
      throw appError('INTERNAL_SERVER_ERROR', 'Failed to send email. Try again.')
    }

    const token = crypto.randomUUID()
    const expires = new Date(Date.now() + 60 * 60 * 1000)

    await prisma.verificationToken.deleteMany({ where: { identifier: email } })

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    })

    try {
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: 'Reset your password',
        text: `Use this link to reset your password: ${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/reset-password?token=${token}`,
      })
    } catch {
      await prisma.verificationToken.deleteMany({ where: { identifier: email, token } })
      throw appError('INTERNAL_SERVER_ERROR', 'Failed to send email. Try again.')
    }

    return { message }
  },

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    const verificationToken = await prisma.verificationToken.findUnique({ where: { token } })

    if (!verificationToken || verificationToken.expires < new Date()) {
      throw appError('BAD_REQUEST', 'Invalid or expired reset link.')
    }

    const user = await prisma.user.findUnique({ where: { email: verificationToken.identifier } })
    if (!user) {
      throw appError('BAD_REQUEST', 'Invalid or expired reset link.')
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    await prisma.verificationToken.delete({ where: { token } })

    return { message: 'Password updated. Please log in.' }
  },
}
