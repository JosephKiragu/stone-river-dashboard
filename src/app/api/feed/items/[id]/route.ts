import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { AppError, updateFeedItem, updateFeedItemSchema } from '@/services/feedItem.service'

type Params = { params: { id: string } }

type ErrorBody = { error: string; field?: string }

type FeedItemBody = {
  id: string
  name: string
  unit: 'KG' | 'BALES' | 'BAGS'
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
): Promise<NextResponse<FeedItemBody | ErrorBody>> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = updateFeedItemSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const isUnitError = issue?.path[0]?.toString() === 'unit'
    return NextResponse.json(
      { error: isUnitError ? 'Invalid unit' : issue?.message ?? 'Invalid input', field: issue?.path[0]?.toString() },
      { status: 400 },
    )
  }

  try {
    const updated = await updateFeedItem(session.user.role, params.id, parsed.data)
    return NextResponse.json(updated, { status: 200 })
  } catch (error: unknown) {
    if (isAppError(error)) {
      return toErrorResponse(error)
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
