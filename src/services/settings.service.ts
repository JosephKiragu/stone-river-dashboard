import { AllocationMethod, Prisma } from '@prisma/client'

import { AppError } from '@/lib/errors'
import { prisma } from '@/lib/prisma'

export type UpdateSettingsInput = {
  marketPricePerKg?: number
  sellCycleDays?: number
  expenseAllocationMethod?: AllocationMethod
}

export async function getSettings() {
  return prisma.appSettings.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      marketPricePerKg: 0,
      sellCycleDays: 90,
      expenseAllocationMethod: AllocationMethod.PROPORTIONAL_WEIGHT,
    },
    select: {
      marketPricePerKg: true,
      sellCycleDays: true,
      expenseAllocationMethod: true,
    },
  })
}

export async function updateSettings(input: UpdateSettingsInput) {
  try {
    return await prisma.appSettings.update({
      where: { id: 'global' },
      data: input,
      select: {
        marketPricePerKg: true,
        sellCycleDays: true,
        expenseAllocationMethod: true,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('NOT_FOUND', 'Settings not found')
    }

    throw err
  }
}
