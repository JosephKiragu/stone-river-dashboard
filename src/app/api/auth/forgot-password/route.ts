import crypto from 'crypto'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { isRateLimited } from '@/lib/ratelimit'
import { rateLimitedResponse, validationErrorResponse } from '@/lib/responses'
import { getResendClient } from '@/lib/resend'

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const genericResponse = {
  message: 'If that email exists, a reset link has been sent.',
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = forgotPasswordSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0]?.trim() ?? 'unknown'

  if (await isRateLimited('forgot-password', `forgot:${ip}`)) {
    return rateLimitedResponse()
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })

  if (!user) {
    return NextResponse.json(genericResponse, { status: 200 })
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000)

  await prisma.verificationToken.deleteMany({
    where: { identifier: parsed.data.email },
  })

  await prisma.verificationToken.create({
    data: {
      identifier: parsed.data.email,
      token: tokenHash,
      expires,
    },
  })

  const resend = getResendClient()

  if (resend) {
    try {
      const resetBaseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
      const resetUrl = `${resetBaseUrl}/reset-password?token=${rawToken}`

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com',
        to: parsed.data.email,
        subject: 'Password reset request',
        html: `<p>Reset your password by visiting <a href="${resetUrl}">this link</a>.</p>`,
      })
    } catch {
      return NextResponse.json(
        { error: 'Failed to send email. Try again.' },
        { status: 500 },
      )
    }
  }

  return NextResponse.json(genericResponse, { status: 200 })
}
