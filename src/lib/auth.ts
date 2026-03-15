import bcrypt from 'bcryptjs'
import type { AdapterUser } from 'next-auth/adapters'
import type { NextAuthOptions, Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

type AppRole = 'OWNER' | 'WORKER'

type AuthUser = {
  id: string
  name: string
  email: string
  role: AppRole
  isActive: boolean
}

type AppUserTokenFields = {
  id: string
  role: AppRole
  isActive: boolean
}

type AuthCallbacks = NonNullable<NextAuthOptions['callbacks']>
type JwtCallbackParams = Parameters<NonNullable<AuthCallbacks['jwt']>>[0]
type SessionCallbackParams = Parameters<NonNullable<AuthCallbacks['session']>>[0]

const isAppUser = (user: User | AdapterUser): user is User & AppUserTokenFields => {
  if (!('role' in user) || !('isActive' in user)) {
    return false
  }

  const role = user.role
  const isActive = user.isActive

  return (role === 'OWNER' || role === 'WORKER') && typeof isActive === 'boolean'
}

export const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO9mdHI8fD8A6lI6aRsWQf4lA2q5v9N3K'

export const authorizeCredentials = async (
  credentials: Partial<Record<'email' | 'password', unknown>> | undefined,
): Promise<AuthUser | null> => {
  const parsed = credentialsSchema.safeParse(credentials)

  if (!parsed.success) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  })

  const hashToCompare = user?.passwordHash ?? DUMMY_HASH
  const passwordOk = await bcrypt.compare(parsed.data.password, hashToCompare)

  if (!user || !passwordOk || !user.isActive) {
    return null
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  }
}

const maxAgeSeconds = Number(process.env.SESSION_MAX_AGE ?? 60 * 60 * 24 * 7)

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: Number.isFinite(maxAgeSeconds) ? maxAgeSeconds : 60 * 60 * 24 * 7,
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, user }: JwtCallbackParams): Promise<JWT> {
      if (user && isAppUser(user)) {
        token.id = user.id
        token.role = user.role
        token.isActive = user.isActive
      }

      return token
    },
    async session({ session, token }: SessionCallbackParams): Promise<Session> {
      session.user = {
        id: token.id as string,
        name: session.user?.name ?? '',
        email: session.user?.email ?? '',
        role: token.role as AppRole,
        isActive: token.isActive as boolean,
      }

      return session
    },
  },
}
