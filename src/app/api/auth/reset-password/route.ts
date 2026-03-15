import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { isAppError, toErrorResponse } from '@/lib/errors'
import { forgotPassword } from '@/services/user.service'

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  try {
    const payload = forgotPasswordSchema.parse(await request.json())
    await forgotPassword(payload.email)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (isAppError(err)) {
      if (err.code === 'BAD_REQUEST') {
        return NextResponse.json(toErrorResponse(err), { status: 400 })
      }

      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
