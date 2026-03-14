import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { isAppError } from '@/lib/errors'
import { userService } from '@/services/user.service'

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const payload = forgotPasswordSchema.parse(body)

    const result = await userService.forgotPassword(payload.email)

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
