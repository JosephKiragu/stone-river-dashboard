import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { AppError, deactivateWorker } from '@/services/user.service'

type Params = { params: { id: string } }

type ErrorBody = { error: string }

type DeactivateResponse = { id: string; isActive: false }

const isAppError = (error: unknown): error is AppError => {
  if (!error || typeof error !== 'object') {
    return false
  }
  return 'code' in error && 'message' in error
}

export async function PATCH(
  _request: Request,
  { params }: Params,
): Promise<NextResponse<DeactivateResponse | ErrorBody>> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await deactivateWorker(session.user.role, params.id)
    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    if (isAppError(error)) {
      if (error.code === 'FORBIDDEN') {
        return NextResponse.json({ error: error.message }, { status: 403 })
      }
      if (error.code === 'NOT_FOUND') {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
