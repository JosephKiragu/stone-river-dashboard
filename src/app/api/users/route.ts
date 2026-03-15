import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import {
  forbiddenResponse,
  invalidBodyResponse,
  isMalformedJsonError,
  unauthorizedResponse,
  validationErrorResponse,
} from '@/lib/responses'
import { createWorker, UserServiceError } from '@/services/user.service'

const createWorkerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
})

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions)

  if (!session) {
    return unauthorizedResponse()
  }

  if (session.user.role !== 'OWNER') {
    return forbiddenResponse()
  }

  let body: unknown

  try {
    body = await request.json()
  } catch (error) {
    if (isMalformedJsonError(error)) {
      return invalidBodyResponse()
    }

    throw error
  }

  const parsed = createWorkerSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  try {
    const user = await createWorker(parsed.data)
    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    if (error instanceof UserServiceError && error.code === 'EMAIL_CONFLICT') {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    throw error
  }
}
