import { Role } from '@prisma/client'
import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import { AppError, isAppError, toErrorResponse } from '@/lib/errors'
import { updateFeedItem } from '@/services/feedItem.service'

type SessionUser = { id?: string; role?: Role | string }
type SessionShape = { user?: SessionUser } | null

const updateFeedItemSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    unit: z.enum(['KG', 'BALES', 'BAGS']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one field is required',
  })

const paramsSchema = z.object({ id: z.string().cuid() })

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

async function requireOwner() {
  const session = (await getServerSession(authOptions)) as SessionShape
  const user = session?.user

  if (!user?.id) {
    throw new AppError('UNAUTHORIZED', 'Unauthorized')
  }

  if (user.role !== Role.OWNER) {
    throw new AppError('FORBIDDEN', 'Forbidden')
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { id: string } },
) {
  try {
    await requireOwner()
    const { id } = paramsSchema.parse(context.params)
    const payload = updateFeedItemSchema.parse(await request.json())
    const item = await updateFeedItem(id, payload)
    return NextResponse.json(item)
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
