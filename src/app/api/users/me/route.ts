import { NextRequest, NextResponse } from 'next/server'

import { mapErrorToStatus } from '@/lib/errors'
import { requireSession } from '@/lib/route-utils'
import { getOwnProfile, updateOwnProfile } from '@/services/user.service'

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireSession()
    const profile = await getOwnProfile(user.id)

    return NextResponse.json(profile, { status: 200 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireSession()
    const body = await request.json()
    const profile = await updateOwnProfile(user.id, body)

    return NextResponse.json(profile, { status: 200 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
