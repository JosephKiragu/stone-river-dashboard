import { NextRequest, NextResponse } from 'next/server'

import { mapErrorToStatus } from '@/lib/errors'
import { resetPassword } from '@/services/user.service'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const result = await resetPassword(body)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    const mapped = mapErrorToStatus(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
