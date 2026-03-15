import { Role } from '@prisma/client'
import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { JWT } from 'next-auth/jwt'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: Number(process.env.SESSION_MAX_AGE) || 7 * 24 * 60 * 60,
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)

        if (!parsed.success) {
          return null
        }

        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })

        if (!user || !user.isActive) {
          return null
        }

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash)

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: import('next-auth').User }) {
      if (user) {
        token.id = user.id
        token.role = user.role as Role
      }

      return token
    },
    async session({
      session,
      token,
    }: {
      session: import('next-auth').Session
      token: JWT
    }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }

      return session
    },
  },
}
