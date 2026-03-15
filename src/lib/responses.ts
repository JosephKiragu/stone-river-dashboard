import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export const unauthorizedResponse = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

export const forbiddenResponse = () =>
  NextResponse.json({ error: 'Forbidden' }, { status: 403 })

export const invalidBodyResponse = () =>
  NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

export const rateLimitedResponse = () =>
  NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })

export const validationErrorResponse = (error: ZodError) => {
  const issue = error.issues[0]
  return NextResponse.json(
    {
      error: issue?.message ?? 'Validation failed',
      field: issue?.path?.[0] ?? 'body',
    },
    { status: 400 },
  )
}

export const isMalformedJsonError = (error: unknown): boolean => {
  return error instanceof SyntaxError
}
