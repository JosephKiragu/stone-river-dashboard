import { withAuth } from 'next-auth/middleware'

export default withAuth({
  callbacks: {
    authorized: ({ req, token }) => {
      const path = req.nextUrl.pathname

      if (path.startsWith('/api/auth') || path === '/login') {
        return true
      }

      return Boolean(token)
    },
  },
  pages: {
    signIn: '/login',
  },
})

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
