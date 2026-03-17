import { AllocationMethod, CowStatus, FeedUnit } from '@prisma/client'
import { z } from 'zod'

import { AppError } from '@/lib/errors'
import { prisma } from '@/lib/prisma'

const defaultSettings = {
  id: 'global',
  marketPricePerKg: 0,
  sellCycleDays: 90,
  expenseAllocationMethod: AllocationMethod.PROPORTIONAL_WEIGHT,
} as const

const includeInactiveSchema = z.object({
  includeInactive: z.boolean().default(false),
})

const updateSettingsSchema = z
  .object({
    marketPricePerKg: z.number().min(0).optional(),
    sellCycleDays: z.number().int().min(30).max(365).optional(),
    expenseAllocationMethod: z.nativeEnum(AllocationMethod).optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
    path: ['body'],
  })

const createPenSchema = z.object({
  name: z.string().min(1).max(50),
  capacity: z.number().int().min(1),
})

const updatePenSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    capacity: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
    path: ['body'],
  })

const createFeedItemSchema = z.object({
  name: z.string().min(1).max(100),
  unit: z.nativeEnum(FeedUnit),
})

const updateFeedItemSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    unit: z.nativeEnum(FeedUnit).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
    path: ['body'],
  })

const cuidSchema = z.string().cuid()

function appErrorFromZod(error: z.ZodError): AppError {
  const issue = error.issues[0]
  const field = issue?.path.join('.') || 'body'

  return new AppError(issue?.message ?? 'Invalid request payload', 400, field)
}

function assertValidCuid(value: string): void {
  if (!cuidSchema.safeParse(value).success) {
    throw new AppError('Invalid id', 400, 'id')
  }
}

export type ListPensOptions = z.infer<typeof includeInactiveSchema>

export async function getSettings() {
  return prisma.appSettings.upsert({
    where: { id: defaultSettings.id },
    update: {},
    create: defaultSettings,
  })
}

export async function updateSettings(input: unknown) {
  const parsed = updateSettingsSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  return prisma.appSettings.upsert({
    where: { id: defaultSettings.id },
    update: {
      marketPricePerKg: parsed.data.marketPricePerKg,
      sellCycleDays: parsed.data.sellCycleDays,
      expenseAllocationMethod: parsed.data.expenseAllocationMethod,
    },
    create: {
      id: defaultSettings.id,
      marketPricePerKg: parsed.data.marketPricePerKg ?? defaultSettings.marketPricePerKg,
      sellCycleDays: parsed.data.sellCycleDays ?? defaultSettings.sellCycleDays,
      expenseAllocationMethod:
        parsed.data.expenseAllocationMethod ?? defaultSettings.expenseAllocationMethod,
    },
  })
}

export async function listPens(rawIncludeInactive: unknown) {
  const parsed = includeInactiveSchema.safeParse({ includeInactive: rawIncludeInactive })

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const includeInactive = parsed.data.includeInactive

  const [pens, cowCounts] = await Promise.all([
    prisma.pen.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        capacity: true,
        isActive: true,
      },
    }),
    prisma.cow.groupBy({
      by: ['penId'],
      where: { status: CowStatus.ACTIVE },
      _count: { _all: true },
    }),
  ])

  const countByPenId = new Map(cowCounts.map((row) => [row.penId, row._count._all]))

  return pens.map((pen) => {
    const activeCowCount = countByPenId.get(pen.id) ?? 0

    return {
      id: pen.id,
      name: pen.name,
      capacity: pen.capacity,
      isActive: pen.isActive,
      activeCowCount,
      occupancyPct: pen.capacity > 0 ? Math.round((activeCowCount / pen.capacity) * 100) : 0,
    }
  })
}

export async function createPen(input: unknown) {
  const parsed = createPenSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const existing = await prisma.pen.findFirst({
    where: {
      name: parsed.data.name,
      isActive: true,
    },
  })

  if (existing) {
    throw new AppError('Pen name already exists', 409)
  }

  return prisma.pen.create({
    data: {
      name: parsed.data.name,
      capacity: parsed.data.capacity,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      capacity: true,
      isActive: true,
    },
  })
}

export async function updatePen(id: string, input: unknown) {
  assertValidCuid(id)

  const parsed = updatePenSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const target = await prisma.pen.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  })

  if (!target) {
    throw new AppError('Pen not found', 404)
  }

  const nextIsActive = parsed.data.isActive ?? target.isActive

  if (parsed.data.name && nextIsActive) {
    const duplicate = await prisma.pen.findFirst({
      where: {
        id: { not: id },
        name: parsed.data.name,
        isActive: true,
      },
      select: { id: true },
    })

    if (duplicate) {
      throw new AppError('Pen name already exists', 409)
    }
  }

  if (parsed.data.isActive === false) {
    return prisma.$transaction(async (tx) => {
      const activeCowCount = await tx.cow.count({
        where: { penId: id, status: CowStatus.ACTIVE },
      })

      if (activeCowCount > 0) {
        throw new AppError('Pen has active cows. Move them before deactivating.', 409)
      }

      return tx.pen.update({
        where: { id },
        data: parsed.data,
        select: {
          id: true,
          name: true,
          capacity: true,
          isActive: true,
        },
      })
    })
  }

  return prisma.pen.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      capacity: true,
      isActive: true,
    },
  })
}

export async function listFeedItems(rawIncludeInactive: unknown) {
  const parsed = includeInactiveSchema.safeParse({ includeInactive: rawIncludeInactive })

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  return prisma.feedItem.findMany({
    where: parsed.data.includeInactive ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      unit: true,
      isActive: true,
    },
  })
}

export async function createFeedItem(input: unknown) {
  const parsed = createFeedItemSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const existing = await prisma.feedItem.findFirst({
    where: {
      name: parsed.data.name,
      isActive: true,
    },
  })

  if (existing) {
    throw new AppError('Feed item name already exists', 409)
  }

  return prisma.feedItem.create({
    data: {
      name: parsed.data.name,
      unit: parsed.data.unit,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      unit: true,
      isActive: true,
    },
  })
}

export async function updateFeedItem(id: string, input: unknown) {
  assertValidCuid(id)

  const parsed = updateFeedItemSchema.safeParse(input)

  if (!parsed.success) {
    throw appErrorFromZod(parsed.error)
  }

  const target = await prisma.feedItem.findUnique({
    where: { id },
    select: {
      id: true,
      isActive: true,
      name: true,
    },
  })

  if (!target) {
    throw new AppError('Feed item not found', 404)
  }

  const nextIsActive = parsed.data.isActive ?? target.isActive

  if (parsed.data.name && nextIsActive) {
    const duplicate = await prisma.feedItem.findFirst({
      where: {
        id: { not: id },
        name: parsed.data.name,
        isActive: true,
      },
      select: { id: true },
    })

    if (duplicate) {
      throw new AppError('Feed item name already exists', 409)
    }
  }

  return prisma.feedItem.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      unit: true,
      isActive: true,
    },
  })
}
