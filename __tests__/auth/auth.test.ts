/** @jest-environment node */
import bcrypt from 'bcryptjs'

const getServerSessionMock = jest.fn()

jest.mock('next-auth', () => ({
  getServerSession: () => getServerSessionMock(),
}))

const findUniqueMock = jest.fn()
const createMock = jest.fn()
const updateMock = jest.fn()
const vtFindUniqueMock = jest.fn()
const vtCreateMock = jest.fn()
const vtDeleteMock = jest.fn()
const transactionMock = jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
    verificationToken: {
      findUnique: (...args: unknown[]) => vtFindUniqueMock(...args),
      create: (...args: unknown[]) => vtCreateMock(...args),
      delete: (...args: unknown[]) => vtDeleteMock(...args),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}))

const sendEmailMock = jest.fn()

jest.mock('@/lib/resend', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => sendEmailMock(...args),
    },
  },
}))

describe('auth module', () => {
  beforeEach(() => {
    jest.resetModules()
    getServerSessionMock.mockReset()
    findUniqueMock.mockReset()
    createMock.mockReset()
    updateMock.mockReset()
    vtFindUniqueMock.mockReset()
    vtCreateMock.mockReset()
    vtDeleteMock.mockReset()
    transactionMock.mockReset()
    sendEmailMock.mockReset()
  })

  it('Worker creation — POST /api/users as OWNER -> 201 + bcrypt hash', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })

    findUniqueMock.mockResolvedValueOnce(null)
    createMock.mockImplementationOnce(async ({ data }: { data: { name: string; email: string; passwordHash: string; role: string; isActive: boolean } }) => ({
      id: 'worker-1',
      name: data.name,
      email: data.email,
      role: data.role,
      isActive: data.isActive,
      passwordHash: data.passwordHash,
    }))

    const { POST } = await import('@/app/api/users/route')
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'W1', email: 'w1@example.com', password: 'password123' }),
    })

    const response = await POST(request as never)
    expect(response.status).toBe(201)

    const body = await response.json()
    expect(body).toMatchObject({
      id: 'worker-1',
      name: 'W1',
      email: 'w1@example.com',
      role: 'WORKER',
      isActive: true,
    })

    const createArg = createMock.mock.calls[0][0]
    expect(createArg.data.passwordHash).not.toBe('password123')
    expect(await bcrypt.compare('password123', createArg.data.passwordHash)).toBe(true)
  })

  it('Worker cannot create users — POST /api/users as WORKER -> 403', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'worker-1', role: 'WORKER' } })

    const { POST } = await import('@/app/api/users/route')
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'W2', email: 'w2@example.com', password: 'password123' }),
    })

    const response = await POST(request as never)
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('Duplicate email — POST /api/users with existing email -> 409', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    findUniqueMock.mockResolvedValueOnce({ id: 'existing' })

    const { POST } = await import('@/app/api/users/route')
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'W2', email: 'w2@example.com', password: 'password123' }),
    })

    const response = await POST(request as never)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Email already in use' })
  })

  it('Unauthenticated create — POST /api/users with no session -> 401', async () => {
    getServerSessionMock.mockResolvedValue(null)

    const { POST } = await import('@/app/api/users/route')
    const request = new Request('http://localhost/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'W2', email: 'w2@example.com', password: 'password123' }),
    })

    const response = await POST(request as never)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('Deactivated user cannot authenticate — deactivate + authorize returns null', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })

    findUniqueMock.mockResolvedValueOnce({ id: 'worker-1', role: 'WORKER' })
    updateMock.mockResolvedValueOnce({ id: 'worker-1', isActive: false })

    const deactivateRoute = await import('@/app/api/users/[id]/deactivate/route')
    const deactivateRes = await deactivateRoute.PATCH(new Request('http://localhost') as never, {
      params: { id: 'worker-1' },
    })

    expect(deactivateRes.status).toBe(200)
    await expect(deactivateRes.json()).resolves.toEqual({ id: 'worker-1', isActive: false })

    findUniqueMock.mockResolvedValueOnce({
      id: 'worker-1',
      email: 'worker@example.com',
      passwordHash: await bcrypt.hash('password123', 12),
      role: 'WORKER',
      isActive: false,
    })

    const { authOptions } = await import('@/lib/auth')
    const provider = authOptions.providers[0]

    if (!('authorize' in provider) || typeof provider.authorize !== 'function') {
      throw new Error('Credentials provider missing authorize')
    }

    const result = await provider.authorize({ email: 'worker@example.com', password: 'password123' }, new Request('http://localhost'))
    expect(result).toBeNull()
  })

  it('Cannot deactivate OWNER — PATCH /api/users/[id]/deactivate targeting OWNER -> 403', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })

    findUniqueMock.mockResolvedValueOnce({ id: 'owner-2', role: 'OWNER' })

    const { PATCH } = await import('@/app/api/users/[id]/deactivate/route')
    const response = await PATCH(new Request('http://localhost') as never, { params: { id: 'owner-2' } })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Cannot deactivate an OWNER' })
  })

  it('Self-update password wrong — PUT /api/users/me incorrect currentPassword -> 400', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'worker-1', role: 'WORKER' } })

    findUniqueMock.mockResolvedValueOnce({
      id: 'worker-1',
      email: 'worker@example.com',
      passwordHash: await bcrypt.hash('correct-password', 12),
      name: 'Worker',
    })

    const { PUT } = await import('@/app/api/users/me/route')
    const request = new Request('http://localhost/api/users/me', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Worker Updated',
        currentPassword: 'wrong-password',
        newPassword: 'new-password-123',
      }),
    })

    const response = await PUT(request as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Current password is incorrect',
      field: undefined,
    })
  })

  it('Forgot password unknown email — POST /api/auth/forgot-password unknown email -> 200', async () => {
    findUniqueMock.mockResolvedValueOnce(null)

    const { POST } = await import('@/app/api/auth/forgot-password/route')
    const request = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ghost@example.com' }),
    })

    const response = await POST(request as never)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ message: 'If that email exists, a reset link has been sent.' })
    expect(vtCreateMock).not.toHaveBeenCalled()
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  it('Reset password valid token — POST /api/auth/reset-password valid token -> 200 + hash update + delete token', async () => {
    vtFindUniqueMock.mockResolvedValueOnce({
      token: 'valid-token',
      identifier: 'user@example.com',
      expires: new Date(Date.now() + 60_000),
    })

    findUniqueMock.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: await bcrypt.hash('old-password', 12),
    })

    updateMock.mockResolvedValueOnce({ id: 'user-1' })
    vtDeleteMock.mockResolvedValueOnce({ token: 'valid-token' })

    const { POST } = await import('@/app/api/auth/reset-password/route')
    const request = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'valid-token', password: 'new-password-123' }),
    })

    const response = await POST(request as never)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ message: 'Password updated. Please log in.' })
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(vtDeleteMock).toHaveBeenCalledWith({ where: { token: 'valid-token' } })

    const updateArg = updateMock.mock.calls[0][0]
    expect(updateArg.where).toEqual({ id: 'user-1' })
    expect(await bcrypt.compare('new-password-123', updateArg.data.passwordHash)).toBe(true)
  })

  it('Reset password expired token — POST /api/auth/reset-password expired token -> 400', async () => {
    vtFindUniqueMock.mockResolvedValueOnce({
      token: 'expired-token',
      identifier: 'user@example.com',
      expires: new Date(Date.now() - 60_000),
    })

    const { POST } = await import('@/app/api/auth/reset-password/route')
    const request = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'expired-token', password: 'new-password-123' }),
    })

    const response = await POST(request as never)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid or expired reset link.' })
  })

  it('WORKER cannot reach OWNER route — OWNER endpoint with WORKER session -> 403', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'worker-1', role: 'WORKER' } })

    const { PATCH } = await import('@/app/api/users/[id]/deactivate/route')
    const response = await PATCH(new Request('http://localhost') as never, { params: { id: 'worker-1' } })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('JWT role claim — token contains role + isActive after login callback', async () => {
    const { authOptions } = await import('@/lib/auth')

    if (!authOptions.callbacks?.jwt || !authOptions.callbacks.session) {
      throw new Error('Callbacks are not defined')
    }

    const jwtToken = await authOptions.callbacks.jwt({
      token: { sub: 'worker-1' },
      user: {
        id: 'worker-1',
        name: 'Worker',
        email: 'worker@example.com',
        role: 'WORKER',
        isActive: true,
      },
      account: null,
      profile: undefined,
      trigger: 'signIn',
      isNewUser: false,
      session: undefined,
    })

    expect(jwtToken.role).toBe('WORKER')
    expect(jwtToken.isActive).toBe(true)

    const session = await authOptions.callbacks.session({
      session: {
        expires: new Date(Date.now() + 1000).toISOString(),
        user: { name: 'Worker', email: 'worker@example.com', image: null },
      },
      token: jwtToken,
      user: undefined,
      newSession: undefined,
      trigger: 'update',
    })

    expect(session.user.role).toBe('WORKER')
    expect(session.user.isActive).toBe(true)
  })
})
