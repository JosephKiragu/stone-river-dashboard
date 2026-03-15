import { Prisma, PrismaClient } from '@prisma/client'

import { AppError } from '@/lib/errors'
import { prisma } from '@/lib/prisma'

const db: PrismaClient = prisma

export type CreateFeedItemInput = {
  name: string
  unit: 'KG' | 'BALES' | 'BAGS'
}

export type UpdateFeedItemInput = {
  name?: string
  unit?: 'KG' | 'BALES' | 'BAGS'
  isActive?: boolean
}

export async function listFeedItems(includeInactive: boolean) {
  return db.feedItem.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createFeedItem(input: CreateFeedItemInput) {
  const existing = await db.feedItem.findFirst({
    where: {
      name: input.name,
      isActive: true,
    },
  })

  if (existing) {
    throw new AppError('CONFLICT', 'Feed item name already exists', 'name')
  }

  try {
    return await db.feedItem.create({
      data: {
        name: input.name,
        unit: input.unit,
        isActive: true,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('CONFLICT', 'Feed item name already exists', 'name')
    }

    throw err
  }
}

export async function updateFeedItem(id: string, input: UpdateFeedItemInput) {
  const existing = await db.feedItem.findUnique({ where: { id } })

  if (!existing) {
    throw new AppError('NOT_FOUND', 'Feed item not found')
  }

  if (input.name !== undefined) {
    const duplicate = await db.feedItem.findFirst({
      where: {
        id: { not: id },
        name: input.name,
        isActive: true,
      },
    })

    if (duplicate) {
      throw new AppError('CONFLICT', 'Feed item name already exists', 'name')
    }
  }

  try {
    return await db.feedItem.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw new AppError('CONFLICT', 'Feed item name already exists', 'name')
      }

      if (err.code === 'P2025') {
        throw new AppError('NOT_FOUND', 'Feed item not found')
      }
    }

    throw err
  }
}
