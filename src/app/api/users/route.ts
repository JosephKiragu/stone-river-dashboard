import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { authOptions } from '@/lib/auth'
import { isAppError } from '@/lib/errors'
import { userService } from '@/services/user.service'

const createWorkerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
})

type WorkerResponse = {
  id: string
  name: string
  email: string
  role: 'WORKER'
  isActive: boolean
}

const unauthorized = (): NextResponse => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const forbidden = (): NextResponse => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    if (session.user.role !== 'OWNER') {
      return forbidden()
    }

    const workers = await userService.listWorkers()
    return NextResponse.json(workers)
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: error.status })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    if (session.user.role !== 'OWNER') {
      return forbidden()
    }

    const body = await request.json()
    const payload = createWorkerSchema.parse(body)

    const worker = await userService.createWorker(payload)

    const response: WorkerResponse = {
      ...worker,
      role: 'WORKER' as const,
    }

    return NextResponse.json(response, { status: 201 })
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
