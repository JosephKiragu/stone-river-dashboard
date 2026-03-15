import { Role } from '@prisma/client'
import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import { AppError, isAppError, toErrorResponse } from '@/lib/errors'
import { createWorker, listWorkers } from '@/services/user.service'

type SessionUser = { id?: string; role?: Role | string }
type SessionShape = { user?: SessionUser } | null

const createWorkerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
})

function mapErrorToStatus(err: AppError): number {
  if (err.code === 'BAD_REQUEST') return 400
  if (err.code === 'UNAUTHORIZED') return 401
  if (err.code === 'FORBIDDEN') return 403
  if (err.code === 'NOT_FOUND') return 404
  if (err.code === 'CONFLICT') return 409
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

export async function GET(_: NextRequest) {
  try {
    await requireOwner()
    const workers = await listWorkers()
    return NextResponse.json(workers)
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json(toErrorResponse(err), { status: mapErrorToStatus(err) })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireOwner()
    const payload = createWorkerSchema.parse(await request.json())
    const worker = await createWorker(payload)
    return NextResponse.json(worker, { status: 201 })
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
