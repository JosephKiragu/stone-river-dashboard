import { NextRequest, NextResponse } from 'next/server'

import { mapErrorToStatus } from '@/lib/errors'
import { requireOwner } from '@/lib/route-utils'
import { updatePen } from '@/services/settings.service'

type RouteContext = {
  params: {
    id: string
  }
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    await requireOwner()
    const body = await request.json()
    const pen = await updatePen(context.params.id, body)

    return NextResponse.json(pen, { status: 200 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
