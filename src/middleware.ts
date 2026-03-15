import { withAuth } from 'next-auth/middleware'

export default withAuth({
  callbacks: {
    authorized: ({ req, token }) => {
      if (req.nextUrl.pathname.startsWith('/api/auth/')) {
        return true
      }

      return token !== null && token.isActive === true
    },
  },
})

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
