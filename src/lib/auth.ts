import type { NextAuthOptions } from 'next-auth'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  providers: [],
}
