import { Role } from '@prisma/client'
import { getServerSession } from 'next-auth/next'

import { authOptions } from '@/lib/auth'
import { AppError } from '@/lib/errors'

export type SessionUser = {
  id: string
  role: Role
  email?: string | null
  name?: string | null
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id || !session.user.role) {
    throw new AppError('Unauthorized', 401)
  }

  return {
    id: session.user.id,
    role: session.user.role,
    email: session.user.email,
    name: session.user.name,
  }
}

export async function requireOwner(): Promise<SessionUser> {
  const user = await requireSession()

  if (user.role !== Role.OWNER) {
    throw new AppError('Forbidden', 403)
  }

  return user
}
