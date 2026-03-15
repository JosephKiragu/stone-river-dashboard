import { NextRequest, NextResponse } from 'next/server'

import { mapErrorToStatus } from '@/lib/errors'
import { requireOwner } from '@/lib/route-utils'
import { createWorker, listWorkers } from '@/services/user.service'

export async function GET(): Promise<NextResponse> {
  try {
    await requireOwner()
    const workers = await listWorkers()

    return NextResponse.json(workers, { status: 200 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireOwner()
    const body = await request.json()
    const worker = await createWorker(body)

    return NextResponse.json(worker, { status: 201 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
