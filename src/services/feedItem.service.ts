import type { FeedUnit, Role } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

const FEED_UNITS = ['KG', 'BALES', 'BAGS'] as const

export const createFeedItemSchema = z.object({
  name: z.string().min(1).max(100),
  unit: z.enum(FEED_UNITS),
})

export type CreateFeedItemInput = z.infer<typeof createFeedItemSchema>

export const updateFeedItemSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    unit: z.enum(FEED_UNITS).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.unit !== undefined || data.isActive !== undefined, {
    message: 'At least one field is required',
    path: ['name'],
  })

export type UpdateFeedItemInput = z.infer<typeof updateFeedItemSchema>

export type FeedItemResponse = {
  id: string
  name: string
  unit: FeedUnit
  isActive: boolean
}

export type AppErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST'

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

const ensureOwner = (role: Role | undefined): void => {
  if (role !== 'OWNER') {
    throw new AppError('FORBIDDEN', 'Forbidden')
  }
}

const toFeedItemResponse = (item: {
  id: string
  name: string
  unit: FeedUnit
  isActive: boolean
}): FeedItemResponse => ({
  id: item.id,
  name: item.name,
  unit: item.unit,
  isActive: item.isActive,
})

export const listFeedItems = async (
  actorRole: Role | undefined,
  includeInactive: boolean,
): Promise<FeedItemResponse[]> => {
  ensureOwner(actorRole)

  const items = await prisma.feedItem.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, unit: true, isActive: true },
  })

  return items.map(toFeedItemResponse)
}

export const createFeedItem = async (
  actorRole: Role | undefined,
  input: CreateFeedItemInput,
): Promise<FeedItemResponse> => {
  ensureOwner(actorRole)

  const duplicate = await prisma.feedItem.findFirst({
    where: {
      name: input.name,
      isActive: true,
    },
    select: { id: true },
  })

  if (duplicate) {
    throw new AppError('CONFLICT', 'Feed item name already exists')
  }

  const created = await prisma.feedItem.create({
    data: {
      name: input.name,
      unit: input.unit,
      isActive: true,
    },
  })

  return toFeedItemResponse(created)
}

export const updateFeedItem = async (
  actorRole: Role | undefined,
  itemId: string,
  input: UpdateFeedItemInput,
): Promise<FeedItemResponse> => {
  ensureOwner(actorRole)

  const existing = await prisma.feedItem.findUnique({
    where: { id: itemId },
    select: { id: true, name: true, isActive: true },
  })

  if (!existing) {
    throw new AppError('NOT_FOUND', 'Feed item not found')
  }

  const resultingIsActive = input.isActive ?? existing.isActive
  const resultingName = input.name ?? existing.name

  if (resultingIsActive) {
    const duplicate = await prisma.feedItem.findFirst({
      where: {
        name: resultingName,
        isActive: true,
        id: { not: itemId },
      },
      select: { id: true },
    })

    if (duplicate) {
      throw new AppError('CONFLICT', 'Feed item name already exists')
    }
  }

  const updated = await prisma.feedItem.update({
    where: { id: itemId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  })

  return toFeedItemResponse(updated)
}
