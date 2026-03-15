import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'OWNER' | 'WORKER'
    isActive: boolean
  }
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: 'OWNER' | 'WORKER'
      isActive: boolean
    }
  }
}
