import type { CowStatus, Role } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

const ACTIVE_STATUS: CowStatus = 'ACTIVE'

export const createPenSchema = z.object({
  name: z.string().min(1).max(50),
  capacity: z.number().int().min(1),
})

export type CreatePenInput = z.infer<typeof createPenSchema>

export const updatePenSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    capacity: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.capacity !== undefined || data.isActive !== undefined, {
    message: 'At least one field is required',
    path: ['name'],
  })

export type UpdatePenInput = z.infer<typeof updatePenSchema>

export type PenListItem = {
  id: string
  name: string
  capacity: number
  isActive: boolean
  activeCowCount: number
  occupancyPct: number
}

export type PenResponse = {
  id: string
  name: string
  capacity: number
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

const toPenResponse = (pen: { id: string; name: string; capacity: number; isActive: boolean }): PenResponse => ({
  id: pen.id,
  name: pen.name,
  capacity: pen.capacity,
  isActive: pen.isActive,
})

const toPenListItem = (pen: {
  id: string
  name: string
  capacity: number
  isActive: boolean
  _count: { cows: number }
}): PenListItem => {
  const activeCowCount = pen._count.cows
  const occupancyPct = pen.capacity === 0 ? 0 : Number(((activeCowCount / pen.capacity) * 100).toFixed(1))

  return {
    id: pen.id,
    name: pen.name,
    capacity: pen.capacity,
    isActive: pen.isActive,
    activeCowCount,
    occupancyPct,
  }
}

export const listPens = async (actorRole: Role | undefined, includeInactive: boolean): Promise<PenListItem[]> => {
  ensureOwner(actorRole)

  const pens = await prisma.pen.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      capacity: true,
      isActive: true,
      _count: {
        select: {
          cows: { where: { status: ACTIVE_STATUS } },
        },
      },
    },
  })

  return pens.map(toPenListItem)
}

export const createPen = async (actorRole: Role | undefined, input: CreatePenInput): Promise<PenResponse> => {
  ensureOwner(actorRole)

  const existing = await prisma.pen.findFirst({
    where: {
      name: input.name,
      isActive: true,
    },
    select: { id: true },
  })

  if (existing) {
    throw new AppError('CONFLICT', 'Pen name already exists')
  }

  const created = await prisma.pen.create({
    data: {
      name: input.name,
      capacity: input.capacity,
      isActive: true,
    },
  })

  return toPenResponse(created)
}

export const updatePen = async (
  actorRole: Role | undefined,
  penId: string,
  input: UpdatePenInput,
): Promise<PenResponse> => {
  ensureOwner(actorRole)

  const existing = await prisma.pen.findUnique({
    where: { id: penId },
    select: { id: true, name: true, isActive: true },
  })

  if (!existing) {
    throw new AppError('NOT_FOUND', 'Pen not found')
  }

  if (input.isActive === false) {
    const activeCowCount = await prisma.cow.count({
      where: {
        penId,
        status: ACTIVE_STATUS,
      },
    })

    if (activeCowCount > 0) {
      throw new AppError('CONFLICT', 'Pen has active cows. Move them before deactivating.')
    }
  }

  const resultingIsActive = input.isActive ?? existing.isActive
  const resultingName = input.name ?? existing.name

  if (resultingIsActive) {
    const duplicate = await prisma.pen.findFirst({
      where: {
        name: resultingName,
        isActive: true,
        id: { not: penId },
      },
      select: { id: true },
    })

    if (duplicate) {
      throw new AppError('CONFLICT', 'Pen name already exists')
    }
  }

  const updated = await prisma.pen.update({
    where: { id: penId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  })

  return toPenResponse(updated)
}
