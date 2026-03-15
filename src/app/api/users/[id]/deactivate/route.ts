import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'

import { authOptions } from '@/lib/auth'
import { forbiddenResponse, unauthorizedResponse } from '@/lib/responses'
import { deactivateWorkerByOwner, UserServiceError } from '@/services/user.service'

export async function PATCH(
  _request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
  const session = await getServerSession(authOptions)

  if (!session) {
    return unauthorizedResponse()
  }

  if (session.user.role !== 'OWNER') {
    return forbiddenResponse()
  }

  try {
    const result = await deactivateWorkerByOwner(context.params.id)
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    if (error instanceof UserServiceError) {
      if (error.code === 'NOT_FOUND') {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      if (error.code === 'TARGET_OWNER') {
        return NextResponse.json(
          { error: 'Cannot deactivate an OWNER' },
          { status: 403 },
        )
      }
    }

    throw error
  }
}
