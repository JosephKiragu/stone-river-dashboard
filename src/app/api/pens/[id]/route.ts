import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { AppError, updatePen, updatePenSchema } from '@/services/pen.service'

type Params = { params: { id: string } }

type ErrorBody = { error: string; field?: string }

type PenBody = {
  id: string
  name: string
  capacity: number
  isActive: boolean
}

const isAppError = (error: unknown): error is AppError => {
  if (!error || typeof error !== 'object') {
    return false
  }
  return 'code' in error && 'message' in error
}

const toErrorResponse = (error: AppError): NextResponse<ErrorBody> => {
  if (error.code === 'FORBIDDEN') {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  if (error.code === 'NOT_FOUND') {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  if (error.code === 'CONFLICT') {
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  return NextResponse.json({ error: error.message, field: error.field }, { status: 400 })
}

export async function PUT(
  request: NextRequest,
  { params }: Params,
): Promise<NextResponse<PenBody | ErrorBody>> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = updatePenSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue?.message ?? 'Invalid input', field: issue?.path[0]?.toString() }, { status: 400 })
  }

  try {
    const updated = await updatePen(session.user.role, params.id, parsed.data)
    return NextResponse.json(updated, { status: 200 })
  } catch (error: unknown) {
    if (isAppError(error)) {
      return toErrorResponse(error)
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
