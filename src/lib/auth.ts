import '@/types/auth'

import bcrypt from 'bcryptjs'
import type { Role } from '@prisma/client'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const sessionMaxAge = Number(process.env.SESSION_MAX_AGE ?? 7 * 24 * 60 * 60)

type AuthUserClaims = {
  id: string
  role: Role
  isActive: boolean
}

const hasAuthUserClaims = (value: unknown): value is AuthUserClaims => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<AuthUserClaims>
  return (
    typeof candidate.id === 'string' &&
    (candidate.role === 'OWNER' || candidate.role === 'WORKER') &&
    typeof candidate.isActive === 'boolean'
  )
}

export const authorizeCredentials = async (
  credentials: unknown,
): Promise<{ id: string; email: string; name: string; role: Role; isActive: boolean } | null> => {
  const parsed = credentialsSchema.safeParse(credentials)
  if (!parsed.success) {
    return null
  }

  const { email, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !user.isActive) {
    return null
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
  }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: sessionMaxAge,
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
      async authorize(credentials) {
        return authorizeCredentials(credentials)
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (hasAuthUserClaims(user)) {
        token.id = user.id
        token.role = user.role
        token.isActive = user.isActive
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === 'string' && (token.role === 'OWNER' || token.role === 'WORKER')) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.isActive = Boolean(token.isActive)
      }
      return session
    },
  },
}
