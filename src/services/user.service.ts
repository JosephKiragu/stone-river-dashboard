import { Prisma, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { Resend } from 'resend'

import { AppError } from '@/lib/errors'
import { prisma } from '@/lib/prisma'

export type UserResponse = {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
}

export function toUserResponse(user: {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
}): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  }
}

export async function listWorkers(): Promise<UserResponse[]> {
  const workers = await prisma.user.findMany({
    where: { role: Role.WORKER },
    orderBy: { createdAt: 'asc' },
  })

  return workers.map(toUserResponse)
}

export async function createWorker(input: {
  name: string
  email: string
  password: string
}): Promise<UserResponse> {
  const passwordHash = await bcrypt.hash(input.password, 12)

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: Role.WORKER,
        isActive: true,
      },
    })

    return toUserResponse(user)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('CONFLICT', 'Email already exists', 'email')
    }

    throw err
  }
}

export async function updateWorker(
  id: string,
  input: {
    name?: string
    email?: string
    isActive?: boolean
    password?: string
  },
): Promise<UserResponse> {
  const data: {
    name?: string
    email?: string
    isActive?: boolean
    passwordHash?: string
  } = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  }

  if (input.password !== undefined) {
    data.passwordHash = await bcrypt.hash(input.password, 12)
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
    })

    return toUserResponse(user)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw new AppError('CONFLICT', 'Email already exists', 'email')
      }

      if (err.code === 'P2025') {
        throw new AppError('NOT_FOUND', 'Worker not found')
      }
    }

    throw err
  }
}

export async function getSelf(id: string): Promise<UserResponse> {
  const user = await prisma.user.findUnique({ where: { id } })

  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found')
  }

  return toUserResponse(user)
}

export async function updateSelf(
  id: string,
  input: {
    name?: string
    email?: string
    password?: string
  },
): Promise<UserResponse> {
  const data: {
    name?: string
    email?: string
    passwordHash?: string
  } = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
  }

  if (input.password !== undefined) {
    data.passwordHash = await bcrypt.hash(input.password, 12)
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
    })

    return toUserResponse(user)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw new AppError('CONFLICT', 'Email already exists', 'email')
      }

      if (err.code === 'P2025') {
        throw new AppError('NOT_FOUND', 'User not found')
      }
    }

    throw err
  }
}

export async function forgotPassword(email: string): Promise<{ sent: true }> {
  const fromEmail = process.env.RESEND_FROM_EMAIL
  const resendKey = process.env.RESEND_API_KEY

  if (!fromEmail || !resendKey) {
    throw new AppError('BAD_REQUEST', 'Email sending is not configured')
  }

  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !user.isActive) {
    return { sent: true }
  }

  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  })

  const token = randomUUID()
  const expires = new Date(Date.now() + 60 * 60 * 1000)

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  })

  const resend = new Resend(resendKey)
  await resend.emails.send({
    from: fromEmail,
    to: [email],
    subject: 'Reset your password',
    html: `<p>Use this token to reset your password: ${token}</p>`,
  })

  return { sent: true }
}
