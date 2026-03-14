import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import { isAppError } from '@/lib/errors'
import { userService } from '@/services/user.service'

const paramsSchema = z.object({
  id: z.string().cuid(),
})

const unauthorized = (): NextResponse => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = (): NextResponse => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

export async function PATCH(
  _request: NextRequest,
  context: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    if (session.user.role !== 'OWNER') {
      return forbidden()
    }

    const { id } = paramsSchema.parse(context.params)
    const result = await userService.deactivateWorker(id)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0]
      return NextResponse.json({ error: issue?.message ?? 'Invalid input', field: issue?.path[0] }, { status: 400 })
    }

    if (isAppError(error)) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: error.status })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
