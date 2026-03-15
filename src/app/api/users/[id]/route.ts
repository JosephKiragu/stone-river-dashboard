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
import { updateWorkerByOwner, UserServiceError } from '@/services/user.service'

const updateWorkerSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
  })
  .refine((value) => value.name || value.email || value.password, {
    message: 'At least one field is required',
    path: ['body'],
  })

export async function PUT(
  request: Request,
  context: { params: { id: string } },
): Promise<NextResponse> {
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

  const parsed = updateWorkerSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  try {
    const user = await updateWorkerByOwner(context.params.id, parsed.data)
    return NextResponse.json(user, { status: 200 })
  } catch (error) {
    if (error instanceof UserServiceError) {
      if (error.code === 'NOT_FOUND') {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      if (error.code === 'TARGET_OWNER') {
        return NextResponse.json(
          { error: 'Cannot modify another OWNER' },
          { status: 403 },
        )
      }

      if (error.code === 'EMAIL_CONFLICT') {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
      }
    }

    throw error
  }
}
