import { AllocationMethod } from '@prisma/client'

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
  })
}

export async function updateSettings(input: UpdateSettingsInput) {
  return prisma.appSettings.update({
    where: { id: 'global' },
    data: input,
  })
}
