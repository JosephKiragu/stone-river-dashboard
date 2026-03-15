import crypto from 'crypto'

import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { isRateLimited } from '@/lib/ratelimit'
import { rateLimitedResponse, validationErrorResponse } from '@/lib/responses'

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = resetPasswordSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0]?.trim() ?? 'unknown'

  if (await isRateLimited('reset-password', `reset:${ip}`)) {
    return rateLimitedResponse()
  }

  const hashedToken = crypto
    .createHash('sha256')
    .update(parsed.data.token)
    .digest('hex')

  const existingToken = await prisma.verificationToken.findUnique({
    where: { token: hashedToken },
  })

  if (!existingToken || existingToken.expires <= new Date()) {
    return NextResponse.json(
      { error: 'Invalid or expired reset link.' },
      { status: 400 },
    )
  }

  const deleted = await prisma.verificationToken.deleteMany({
    where: {
      token: hashedToken,
      expires: { gt: new Date() },
    },
  })

  if (deleted.count === 0) {
    return NextResponse.json(
      { error: 'Invalid or expired reset link.' },
      { status: 400 },
    )
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)

  await prisma.user.update({
    where: { email: existingToken.identifier },
    data: { passwordHash },
  })

  return NextResponse.json(
    { message: 'Password updated. Please log in.' },
    { status: 200 },
  )
}
