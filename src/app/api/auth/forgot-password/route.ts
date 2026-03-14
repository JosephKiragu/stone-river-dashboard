import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { AppError, forgotPassword, forgotPasswordSchema } from '@/services/user.service'

type ForgotResponse = { message: string }

type ErrorBody = { error: string; field?: string }

export async function POST(request: NextRequest): Promise<NextResponse<ForgotResponse | ErrorBody>> {
  const body = await request.json()
  const parsed = forgotPasswordSchema.safeParse(body)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue?.message ?? 'Invalid input', field: issue?.path[0]?.toString() }, { status: 400 })
  }

  try {
    await forgotPassword(parsed.data)
    return NextResponse.json({ message: 'If that email exists, a reset link has been sent.' }, { status: 200 })
  } catch (error: unknown) {
    if (error instanceof AppError) {
      if (error.code === 'INTERNAL_ERROR') {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ error: error.message, field: error.field }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
