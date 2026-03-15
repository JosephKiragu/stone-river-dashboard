import { CowStatus, Prisma, PrismaClient } from '@prisma/client'

import { AppError } from '@/lib/errors'
import { prisma } from '@/lib/prisma'

const db: PrismaClient = prisma

export type CreatePenInput = {
  name: string
  capacity: number
}

export type UpdatePenInput = {
  name?: string
  capacity?: number
  isActive?: boolean
}

export async function listPens(includeInactive: boolean) {
  const pens = await db.pen.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  return Promise.all(
    pens.map(async (pen) => {
      const activeCowCount = await db.cow.count({
        where: {
          penId: pen.id,
          status: CowStatus.ACTIVE,
        },
      })

      const occupancyPct = pen.capacity > 0 ? (activeCowCount / pen.capacity) * 100 : 0

      return {
        ...pen,
        activeCowCount,
        occupancyPct,
      }
    }),
  )
}

export async function createPen(input: CreatePenInput) {
  const existing = await db.pen.findFirst({
    where: {
      name: input.name,
      isActive: true,
    },
  })

  if (existing) {
    throw new AppError('CONFLICT', 'Pen name already exists', 'name')
  }

  try {
    return await db.pen.create({
      data: {
        name: input.name,
        capacity: input.capacity,
        isActive: true,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw new AppError('CONFLICT', 'Pen name already exists', 'name')
      }
    }

    throw err
  }
}

export async function updatePen(id: string, input: UpdatePenInput) {
  const existing = await db.pen.findUnique({ where: { id } })

  if (!existing) {
    throw new AppError('NOT_FOUND', 'Pen not found')
  }

  if (input.name !== undefined) {
    const duplicate = await db.pen.findFirst({
      where: {
        id: { not: id },
        name: input.name,
        isActive: true,
      },
    })

    if (duplicate) {
      throw new AppError('CONFLICT', 'Pen name already exists', 'name')
    }
  }

  if (input.isActive === false && existing.isActive === true) {
    const activeCowCount = await db.cow.count({
      where: {
        penId: id,
        status: CowStatus.ACTIVE,
      },
    })

    if (activeCowCount > 0) {
      throw new AppError('CONFLICT', 'Pen has active cows. Move them before deactivating.')
    }
  }

  try {
    return await db.pen.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw new AppError('CONFLICT', 'Pen name already exists', 'name')
      }

      if (err.code === 'P2025') {
        throw new AppError('NOT_FOUND', 'Pen not found')
      }
    }

    throw err
  }
}
