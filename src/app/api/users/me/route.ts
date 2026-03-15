import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import { AppError, isAppError, toErrorResponse } from '@/lib/errors'
import { getSelf, updateSelf } from '@/services/user.service'

type SessionShape = { user?: { id?: string } } | null

const updateSelfSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one field is required',
  })

function mapErrorToStatus(err: AppError): number {
  if (err.code === 'BAD_REQUEST') return 400
  if (err.code === 'UNAUTHORIZED') return 401
  if (err.code === 'FORBIDDEN') return 403
  if (err.code === 'NOT_FOUND') return 404
  if (err.code === 'CONFLICT') return 409
  return 500
}

async function requireSessionUserId(): Promise<string> {
  const session = (await getServerSession(authOptions)) as SessionShape

  if (!session?.user?.id) {
    throw new AppError('UNAUTHORIZED', 'Unauthorized')
  }

  return session.user.id
}

export async function GET(_: NextRequest) {
  try {
    const userId = await requireSessionUserId()
    const user = await getSelf(userId)
    return NextResponse.json(user)
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: mapErrorToStatus(err) })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireSessionUserId()
    const payload = updateSelfSchema.parse(await request.json())
    const user = await updateSelf(userId, payload)
    return NextResponse.json(user)
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
