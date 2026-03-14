declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: 'OWNER' | 'WORKER';
    isActive: boolean;
  }
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'OWNER' | 'WORKER';
      isActive: boolean;
    };
  }
}
