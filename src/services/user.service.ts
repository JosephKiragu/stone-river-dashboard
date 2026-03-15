import bcrypt from 'bcryptjs'

import { prisma } from '@/lib/prisma'

const BCRYPT_ROUNDS = 12

export type PublicUser = {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'WORKER'
  isActive: boolean
}

export class UserServiceError extends Error {
  code: 'EMAIL_CONFLICT' | 'NOT_FOUND' | 'TARGET_OWNER' | 'INVALID_CURRENT_PASSWORD'

  constructor(
    code: 'EMAIL_CONFLICT' | 'NOT_FOUND' | 'TARGET_OWNER' | 'INVALID_CURRENT_PASSWORD',
    message: string,
  ) {
    super(message)
    this.code = code
  }
}

const isUniqueConstraintError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }

  return 'code' in error && (error as { code?: string }).code === 'P2002'
}

const toPublicUser = (user: {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'WORKER'
  isActive: boolean
}): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
})

export const createWorker = async (input: {
  name: string
  email: string
  password: string
}): Promise<PublicUser> => {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: 'WORKER',
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

    return toPublicUser(user)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new UserServiceError('EMAIL_CONFLICT', 'Email already in use')
    }

    throw error
  }
}

export const updateWorkerByOwner = async (
  id: string,
  input: { name?: string; email?: string; password?: string },
): Promise<PublicUser> => {
  const user = await prisma.user.findUnique({ where: { id } })

  if (!user) {
    throw new UserServiceError('NOT_FOUND', 'User not found')
  }

  if (user.role === 'OWNER') {
    throw new UserServiceError('TARGET_OWNER', 'Cannot modify another OWNER')
  }

  const data: {
    name?: string
    email?: string
    passwordHash?: string
  } = {}

  if (typeof input.name === 'string') {
    data.name = input.name
  }

  if (typeof input.email === 'string') {
    data.email = input.email
  }

  if (typeof input.password === 'string') {
    data.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    })

    return toPublicUser(updated)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new UserServiceError('EMAIL_CONFLICT', 'Email already in use')
    }

    throw error
  }
}

export const deactivateWorkerByOwner = async (
  id: string,
): Promise<{ id: string; isActive: boolean }> => {
  const user = await prisma.user.findUnique({ where: { id } })

  if (!user) {
    throw new UserServiceError('NOT_FOUND', 'User not found')
  }

  if (user.role === 'OWNER') {
    throw new UserServiceError('TARGET_OWNER', 'Cannot deactivate an OWNER')
  }

  return prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, isActive: true },
  })
}

export const updateSelfUser = async (
  userId: string,
  input: {
    name?: string
    email?: string
    currentPassword?: string
    newPassword?: string
  },
): Promise<{ id: string; name: string; email: string }> => {
  const user = await prisma.user.findUnique({ where: { id: userId } })

  if (!user) {
    throw new UserServiceError('NOT_FOUND', 'User not found')
  }

  const data: { name?: string; email?: string; passwordHash?: string } = {}

  if (typeof input.name === 'string') {
    data.name = input.name
  }

  if (typeof input.email === 'string') {
    data.email = input.email
  }

  if (typeof input.newPassword === 'string') {
    const passwordOk = await bcrypt.compare(
      input.currentPassword ?? '',
      user.passwordHash,
    )

    if (!passwordOk) {
      throw new UserServiceError(
        'INVALID_CURRENT_PASSWORD',
        'Current password is incorrect',
      )
    }

    data.passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS)
  }

  try {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
      },
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new UserServiceError('EMAIL_CONFLICT', 'Email already in use')
    }

    throw error
  }
}
