import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const ownerEmail = process.env.OWNER_EMAIL;
        const ownerHash = process.env.OWNER_PASSWORD_HASH;

        if (!ownerEmail || !ownerHash) {
          console.error("OWNER_EMAIL or OWNER_PASSWORD_HASH env var not set");
          return null;
        }

        if (email !== ownerEmail) return null;

        const isValid = await bcrypt.compare(password, ownerHash);
        if (!isValid) return null;

        return { id: "owner", name: "Owner", email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token }) {
      return token;
    },
    async session({ session }) {
      return session;
    },
  },
});
