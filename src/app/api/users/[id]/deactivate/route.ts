import { NextResponse } from 'next/server'

import { mapErrorToStatus } from '@/lib/errors'
import { requireOwner } from '@/lib/route-utils'
import { deactivateWorker } from '@/services/user.service'

type RouteContext = {
  params: {
    id: string
  }
}

export async function PATCH(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    await requireOwner()
    const result = await deactivateWorker(context.params.id)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
