import { withAuth } from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized: ({ token }) => Boolean(token) && token.isActive === true,
  },
});

export const config = {
  matcher: ['/dashboard/:path*', '/api/users/:path*'],
};
