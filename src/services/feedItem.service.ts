import { Prisma } from '@prisma/client'

import { AppError } from '@/lib/errors'
import { prisma } from '@/lib/prisma'

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
  return prisma.feedItem.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createFeedItem(input: CreateFeedItemInput) {
  try {
    return await prisma.feedItem.create({
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
  const existing = await prisma.feedItem.findUnique({ where: { id } })

  if (!existing) {
    throw new AppError('NOT_FOUND', 'Feed item not found')
  }

  try {
    return await prisma.feedItem.update({
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
