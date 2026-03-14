import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { AppError, selfUpdateSchema, updateSelf } from '@/services/user.service'

type ErrorBody = { error: string; field?: string }

type SelfResponse = { id: string; name: string; email: string }

const isAppError = (error: unknown): error is AppError => {
  if (!error || typeof error !== 'object') {
    return false
  }
  return 'code' in error && 'message' in error
}

export async function PUT(request: NextRequest): Promise<NextResponse<SelfResponse | ErrorBody>> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = selfUpdateSchema.safeParse(body)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue?.message ?? 'Invalid input', field: issue?.path[0]?.toString() }, { status: 400 })
  }

  try {
    const updated = await updateSelf(session.user.id, parsed.data)
    return NextResponse.json(updated, { status: 200 })
  } catch (error: unknown) {
    if (isAppError(error)) {
      if (error.code === 'CONFLICT') {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (error.code === 'BAD_REQUEST') {
        return NextResponse.json({ error: error.message, field: error.field }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
