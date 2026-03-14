import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { AppError, createFeedItem, createFeedItemSchema, listFeedItems } from '@/services/feedItem.service'

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

const parseIncludeInactive = (request: NextRequest): boolean => {
  const searchValue =
    'nextUrl' in request
      ? request.nextUrl.searchParams.get('includeInactive')
      : new URL(request.url).searchParams.get('includeInactive')

  return searchValue === 'true'
}

export async function GET(request: NextRequest): Promise<NextResponse<FeedItemBody[] | ErrorBody>> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const items = await listFeedItems(session.user.role, parseIncludeInactive(request))
    return NextResponse.json(items, { status: 200 })
  } catch (error: unknown) {
    if (isAppError(error)) {
      return toErrorResponse(error)
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<FeedItemBody | ErrorBody>> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = createFeedItemSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const isUnitError = issue?.path[0]?.toString() === 'unit'
    return NextResponse.json(
      { error: isUnitError ? 'Invalid unit' : issue?.message ?? 'Invalid input', field: issue?.path[0]?.toString() },
      { status: 400 },
    )
  }

  try {
    const created = await createFeedItem(session.user.role, parsed.data)
    return NextResponse.json(created, { status: 201 })
  } catch (error: unknown) {
    if (isAppError(error)) {
      return toErrorResponse(error)
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
