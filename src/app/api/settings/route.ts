import { NextRequest, NextResponse } from 'next/server'

import { mapErrorToStatus } from '@/lib/errors'
import { requireOwner } from '@/lib/route-utils'
import { getSettings, updateSettings } from '@/services/settings.service'

export async function GET(): Promise<NextResponse> {
  try {
    await requireOwner()
    const settings = await getSettings()

    return NextResponse.json(settings, { status: 200 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    await requireOwner()
    const body = await request.json()
    const settings = await updateSettings(body)

    return NextResponse.json(settings, { status: 200 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
