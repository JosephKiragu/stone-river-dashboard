/** @jest-environment node */
const getServerSessionMock = jest.fn()

jest.mock('next-auth', () => ({
  getServerSession: () => getServerSessionMock(),
}))

const appSettingsUpsertMock = jest.fn()
const penFindManyMock = jest.fn()
const penFindFirstMock = jest.fn()
const penFindUniqueMock = jest.fn()
const penCreateMock = jest.fn()
const penUpdateMock = jest.fn()
const cowCountMock = jest.fn()
const feedItemFindManyMock = jest.fn()
const feedItemFindFirstMock = jest.fn()
const feedItemFindUniqueMock = jest.fn()
const feedItemCreateMock = jest.fn()
const feedItemUpdateMock = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    appSettings: {
      upsert: (...args: unknown[]) => appSettingsUpsertMock(...args),
    },
    pen: {
      findMany: (...args: unknown[]) => penFindManyMock(...args),
      findFirst: (...args: unknown[]) => penFindFirstMock(...args),
      findUnique: (...args: unknown[]) => penFindUniqueMock(...args),
      create: (...args: unknown[]) => penCreateMock(...args),
      update: (...args: unknown[]) => penUpdateMock(...args),
    },
    cow: {
      count: (...args: unknown[]) => cowCountMock(...args),
    },
    feedItem: {
      findMany: (...args: unknown[]) => feedItemFindManyMock(...args),
      findFirst: (...args: unknown[]) => feedItemFindFirstMock(...args),
      findUnique: (...args: unknown[]) => feedItemFindUniqueMock(...args),
      create: (...args: unknown[]) => feedItemCreateMock(...args),
      update: (...args: unknown[]) => feedItemUpdateMock(...args),
    },
  },
}))

describe('settings module', () => {
  beforeEach(() => {
    jest.resetModules()
    getServerSessionMock.mockReset()
    appSettingsUpsertMock.mockReset()
    penFindManyMock.mockReset()
    penFindFirstMock.mockReset()
    penFindUniqueMock.mockReset()
    penCreateMock.mockReset()
    penUpdateMock.mockReset()
    cowCountMock.mockReset()
    feedItemFindManyMock.mockReset()
    feedItemFindFirstMock.mockReset()
    feedItemFindUniqueMock.mockReset()
    feedItemCreateMock.mockReset()
    feedItemUpdateMock.mockReset()
  })

  it('Settings bootstrap — GET /api/settings when row absent -> row created with defaults, returned', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    appSettingsUpsertMock.mockResolvedValue({
      id: 'global',
      marketPricePerKg: 0,
      sellCycleDays: 90,
      expenseAllocationMethod: 'PROPORTIONAL_WEIGHT',
    })

    const { GET } = await import('@/app/api/settings/route')
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      marketPricePerKg: 0,
      sellCycleDays: 90,
      expenseAllocationMethod: 'PROPORTIONAL_WEIGHT',
    })

    expect(appSettingsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'global' },
      }),
    )
  })

  it('Settings update — PUT /api/settings valid body -> 200, updated object returned', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    appSettingsUpsertMock.mockResolvedValue({
      id: 'global',
      marketPricePerKg: 275,
      sellCycleDays: 120,
      expenseAllocationMethod: 'EQUAL_SPLIT',
    })

    const { PUT } = await import('@/app/api/settings/route')
    const request = new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        marketPricePerKg: 275,
        sellCycleDays: 120,
        expenseAllocationMethod: 'EQUAL_SPLIT',
      }),
    })

    const response = await PUT(request as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      marketPricePerKg: 275,
      sellCycleDays: 120,
      expenseAllocationMethod: 'EQUAL_SPLIT',
    })
  })

  it('Pen creation — POST /api/pens valid body -> 201, correct fields returned', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    penFindFirstMock.mockResolvedValue(null)
    penCreateMock.mockResolvedValue({
      id: 'pen-1',
      name: 'North Pen',
      capacity: 50,
      isActive: true,
    })

    const { POST } = await import('@/app/api/pens/route')
    const request = new Request('http://localhost/api/pens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'North Pen', capacity: 50 }),
    })

    const response = await POST(request as never)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: 'pen-1',
      name: 'North Pen',
      capacity: 50,
      isActive: true,
    })
  })

  it('Pen name conflict — POST /api/pens duplicate active name -> 409', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    penFindFirstMock.mockResolvedValue({ id: 'pen-existing' })

    const { POST } = await import('@/app/api/pens/route')
    const request = new Request('http://localhost/api/pens', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'North Pen', capacity: 50 }),
    })

    const response = await POST(request as never)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Pen name already exists' })
  })

  it('Pen deactivation blocked — PUT /api/pens/[id] isActive=false with active cows -> 409', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    penFindUniqueMock.mockResolvedValue({ id: 'pen-1', name: 'North Pen', isActive: true })
    cowCountMock.mockResolvedValue(3)

    const { PUT } = await import('@/app/api/pens/[id]/route')
    const request = new Request('http://localhost/api/pens/pen-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })

    const response = await PUT(request as never, { params: { id: 'pen-1' } })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Pen has active cows. Move them before deactivating.' })
  })

  it('Pen deactivation allowed — PUT /api/pens/[id] isActive=false with zero active cows -> 200', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    penFindUniqueMock.mockResolvedValue({ id: 'pen-1', name: 'North Pen', isActive: true })
    cowCountMock.mockResolvedValue(0)
    penFindFirstMock.mockResolvedValue(null)
    penUpdateMock.mockResolvedValue({
      id: 'pen-1',
      name: 'North Pen',
      capacity: 50,
      isActive: false,
    })

    const { PUT } = await import('@/app/api/pens/[id]/route')
    const request = new Request('http://localhost/api/pens/pen-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })

    const response = await PUT(request as never, { params: { id: 'pen-1' } })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'pen-1',
      name: 'North Pen',
      capacity: 50,
      isActive: false,
    })
  })

  it('Pen hidden after deactivation — GET /api/pens (no query param) does not return deactivated pen', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    penFindManyMock.mockResolvedValue([
      {
        id: 'pen-2',
        name: 'Active Pen',
        capacity: 10,
        isActive: true,
        _count: { cows: 5 },
      },
    ])

    const { GET } = await import('@/app/api/pens/route')
    const request = new Request('http://localhost/api/pens')

    const response = await GET(request as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        id: 'pen-2',
        name: 'Active Pen',
        capacity: 10,
        isActive: true,
        activeCowCount: 5,
        occupancyPct: 50,
      },
    ])
    expect(penFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }))
  })

  it('Feed item creation — POST /api/feed/items valid body -> 201', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    feedItemFindFirstMock.mockResolvedValue(null)
    feedItemCreateMock.mockResolvedValue({
      id: 'feed-1',
      name: 'Hay',
      unit: 'BALES',
      isActive: true,
    })

    const { POST } = await import('@/app/api/feed/items/route')
    const request = new Request('http://localhost/api/feed/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Hay', unit: 'BALES' }),
    })

    const response = await POST(request as never)

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: 'feed-1',
      name: 'Hay',
      unit: 'BALES',
      isActive: true,
    })
  })

  it('Feed item name conflict — POST /api/feed/items duplicate active name -> 409', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })
    feedItemFindFirstMock.mockResolvedValue({ id: 'feed-existing' })

    const { POST } = await import('@/app/api/feed/items/route')
    const request = new Request('http://localhost/api/feed/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Hay', unit: 'KG' }),
    })

    const response = await POST(request as never)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Feed item name already exists' })
  })

  it('WORKER blocked — PUT /api/settings as WORKER -> 403', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'worker-1', role: 'WORKER' } })

    const { PUT } = await import('@/app/api/settings/route')
    const request = new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marketPricePerKg: 10 }),
    })

    const response = await PUT(request as never)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('Unauthenticated blocked — GET /api/settings without session -> 401', async () => {
    getServerSessionMock.mockResolvedValue(null)

    const { GET } = await import('@/app/api/settings/route')
    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('sellCycleDays validation — PUT /api/settings sellCycleDays=29 -> 400; sellCycleDays=365 -> 200', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1', role: 'OWNER' } })

    const { PUT } = await import('@/app/api/settings/route')

    const invalidRequest = new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sellCycleDays: 29 }),
    })
    const invalidResponse = await PUT(invalidRequest as never)
    expect(invalidResponse.status).toBe(400)

    appSettingsUpsertMock.mockResolvedValueOnce({
      id: 'global',
      marketPricePerKg: 0,
      sellCycleDays: 365,
      expenseAllocationMethod: 'PROPORTIONAL_WEIGHT',
    })

    const validRequest = new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sellCycleDays: 365 }),
    })
    const validResponse = await PUT(validRequest as never)
    expect(validResponse.status).toBe(200)
    await expect(validResponse.json()).resolves.toEqual({
      marketPricePerKg: 0,
      sellCycleDays: 365,
      expenseAllocationMethod: 'PROPORTIONAL_WEIGHT',
    })
  })
})
