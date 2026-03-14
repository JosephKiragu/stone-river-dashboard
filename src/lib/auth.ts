import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createRatelimit } from '@/lib/ratelimit';

// Pre-computed bcrypt hash of a random string, used to prevent timing attacks
// when user does not exist or is inactive.
export const DUMMY_HASH =
  '$2b$12$K2CtDP7zSGOKgjXjxD9SYey4f2PxqThI.nEHqyVQUdNOKABGYnrHi';

// Exported for unit testing
export async function authorizeCredentials(
  credentials: Record<string, string> | undefined,
  req: { headers?: Record<string, string | string[] | undefined> }
): Promise<{
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
} | null> {
  // Rate limiting — per IP, 10 attempts per 15 minutes
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const ip =
    (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)
      ?.split(',')[0]
      ?.trim() ?? '127.0.0.1';

  const limiter = createRatelimit(10, '15 m');
  const { success: rateLimitOk } = await limiter.limit(ip);
  if (!rateLimitOk) {
    return null;
  }

  const email = credentials?.email;
  const password = credentials?.password;
  if (!email || !password) return null;

  const user = await prisma.user.findUnique({ where: { email } });

  // Always run bcrypt.compare to prevent timing side-channel
  if (!user || !user.isActive) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
  };
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  jwt: {
    maxAge: Number(process.env.SESSION_MAX_AGE) || 7 * 24 * 60 * 60,
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
      authorize: authorizeCredentials as Parameters<typeof CredentialsProvider>[0]['authorize'],
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          id: string;
          role: 'OWNER' | 'WORKER';
          isActive: boolean;
        };
        token.id = u.id;
        token.role = u.role;
        token.isActive = u.isActive;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id,
        role: token.role,
        isActive: token.isActive,
      };
      return session;
    },
  },
};
