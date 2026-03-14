import type { AllocationMethod, Role } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

export const updateSettingsSchema = z
  .object({
    marketPricePerKg: z.number().min(0).optional(),
    sellCycleDays: z.number().int().min(30).max(365).optional(),
    expenseAllocationMethod: z.enum(['PROPORTIONAL_WEIGHT', 'EQUAL_SPLIT']).optional(),
  })
  .refine((data) => data.marketPricePerKg !== undefined || data.sellCycleDays !== undefined || data.expenseAllocationMethod !== undefined, {
    message: 'At least one field is required',
    path: ['marketPricePerKg'],
  })

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

export type SettingsResponse = {
  marketPricePerKg: number
  sellCycleDays: number
  expenseAllocationMethod: AllocationMethod
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

const toSettingsResponse = (settings: {
  marketPricePerKg: number
  sellCycleDays: number
  expenseAllocationMethod: AllocationMethod
}): SettingsResponse => ({
  marketPricePerKg: settings.marketPricePerKg,
  sellCycleDays: settings.sellCycleDays,
  expenseAllocationMethod: settings.expenseAllocationMethod,
})

export const getSettings = async (actorRole: Role | undefined): Promise<SettingsResponse> => {
  ensureOwner(actorRole)

  const settings = await prisma.appSettings.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      marketPricePerKg: 0,
      sellCycleDays: 90,
      expenseAllocationMethod: 'PROPORTIONAL_WEIGHT',
    },
    update: {},
  })

  return toSettingsResponse(settings)
}

export const updateSettings = async (
  actorRole: Role | undefined,
  input: UpdateSettingsInput,
): Promise<SettingsResponse> => {
  ensureOwner(actorRole)

  const settings = await prisma.appSettings.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      marketPricePerKg: input.marketPricePerKg ?? 0,
      sellCycleDays: input.sellCycleDays ?? 90,
      expenseAllocationMethod: input.expenseAllocationMethod ?? 'PROPORTIONAL_WEIGHT',
    },
    update: {
      ...(input.marketPricePerKg !== undefined ? { marketPricePerKg: input.marketPricePerKg } : {}),
      ...(input.sellCycleDays !== undefined ? { sellCycleDays: input.sellCycleDays } : {}),
      ...(input.expenseAllocationMethod !== undefined
        ? { expenseAllocationMethod: input.expenseAllocationMethod }
        : {}),
    },
  })

  return toSettingsResponse(settings)
}
