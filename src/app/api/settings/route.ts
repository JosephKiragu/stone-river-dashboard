import { AllocationMethod, Role } from '@prisma/client'
import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import { AppError, isAppError, toErrorResponse } from '@/lib/errors'
import { getSettings, updateSettings } from '@/services/settings.service'

type SessionUser = { id?: string; role?: Role | string }

type SessionShape = { user?: SessionUser } | null

const putSettingsSchema = z
  .object({
    marketPricePerKg: z.number().min(0).optional(),
    sellCycleDays: z.number().int().min(30).max(365).optional(),
    expenseAllocationMethod: z.nativeEnum(AllocationMethod).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one field is required',
  })

function mapErrorToStatus(err: AppError): number {
  if (err.code === 'BAD_REQUEST') {
    return 400
  }

  if (err.code === 'UNAUTHORIZED') {
    return 401
  }

  if (err.code === 'FORBIDDEN') {
    return 403
  }

  if (err.code === 'NOT_FOUND') {
    return 404
  }

  if (err.code === 'CONFLICT') {
    return 409
  }

  return 500
}

async function requireOwner(): Promise<SessionUser> {
  const session = (await getServerSession(authOptions)) as SessionShape
  const user = session?.user

  if (!user?.id) {
    throw new AppError('UNAUTHORIZED', 'Unauthorized')
  }

  if (user.role !== Role.OWNER) {
    throw new AppError('FORBIDDEN', 'Forbidden')
  }

  return user
}

export async function GET(_: NextRequest) {
  try {
    await requireOwner()
    const settings = await getSettings()
    return NextResponse.json(settings)
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: mapErrorToStatus(err) })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireOwner()
    const payload = putSettingsSchema.parse(await request.json())
    const settings = await updateSettings(payload)
    return NextResponse.json(settings)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: mapErrorToStatus(err) })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
