import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { AppError, resetPassword, resetPasswordSchema } from '@/services/user.service'

type ResetResponse = { message: string }

type ErrorBody = { error: string; field?: string }

export async function POST(request: NextRequest): Promise<NextResponse<ResetResponse | ErrorBody>> {
  const body = await request.json()
  const parsed = resetPasswordSchema.safeParse(body)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue?.message ?? 'Invalid input', field: issue?.path[0]?.toString() }, { status: 400 })
  }

  try {
    await resetPassword(parsed.data)
    return NextResponse.json({ message: 'Password updated. Please log in.' }, { status: 200 })
  } catch (error: unknown) {
    if (error instanceof AppError) {
      if (error.code === 'BAD_REQUEST') {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      return NextResponse.json({ error: error.message, field: error.field }, { status: 500 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
