import { NextRequest, NextResponse } from 'next/server'

import { mapErrorToStatus } from '@/lib/errors'
import { requireOwner } from '@/lib/route-utils'
import { createPen, listPens } from '@/services/settings.service'

function parseIncludeInactive(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('includeInactive') === 'true'
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireOwner()
    const pens = await listPens(parseIncludeInactive(request))

    return NextResponse.json(pens, { status: 200 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireOwner()
    const body = await request.json()
    const pen = await createPen(body)

    return NextResponse.json(pen, { status: 201 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
