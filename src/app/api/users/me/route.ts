import { getServerSession } from 'next-auth/next'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import {
  invalidBodyResponse,
  isMalformedJsonError,
  unauthorizedResponse,
  validationErrorResponse,
} from '@/lib/responses'
import { updateSelfUser, UserServiceError } from '@/services/user.service'

const updateSelfSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    currentPassword: z.string().min(8).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword && !value.currentPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['currentPassword'],
        message: 'Current password is required',
      })
    }

    if (!value.name && !value.email && !value.newPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'At least one field is required',
      })
    }
  })

export async function PUT(request: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions)

  if (!session) {
    return unauthorizedResponse()
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

  const parsed = updateSelfSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  try {
    const user = await updateSelfUser(session.user.id, parsed.data)
    return NextResponse.json(user, { status: 200 })
  } catch (error) {
    if (error instanceof UserServiceError) {
      if (error.code === 'INVALID_CURRENT_PASSWORD') {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 },
        )
      }

      if (error.code === 'EMAIL_CONFLICT') {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
      }

      if (error.code === 'NOT_FOUND') {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
    }

    throw error
  }
}
