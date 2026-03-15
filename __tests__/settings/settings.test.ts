import { Role } from '@prisma/client'
import { getServerSession } from 'next-auth/next'

import { GET as getFeedItems, POST as postFeedItems } from '@/app/api/feed/items/route'
import { PUT as putFeedItemById } from '@/app/api/feed/items/[id]/route'
import { GET as getPens, POST as postPens } from '@/app/api/pens/route'
import { PUT as putPenById } from '@/app/api/pens/[id]/route'
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route'
import { prisma } from '@/lib/prisma'

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/prisma', () => {
  const prismaMock = {
    appSettings: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    pen: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cow: {
      count: jest.fn(),
    },
    feedItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    feedStockEntry: {
      deleteMany: jest.fn(),
    },
    feedRation: {
      deleteMany: jest.fn(),
    },
  }

  return { prisma: prismaMock }
})

type MockSession = { user: { id: string; role: Role } } | null

const mockedGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockedPrisma = prisma as unknown as {
  appSettings: {
    upsert: jest.Mock
    update: jest.Mock
  }
  pen: {
    findMany: jest.Mock
    findFirst: jest.Mock
    findUnique: jest.Mock
    create: jest.Mock
    update: jest.Mock
  }
  cow: {
    count: jest.Mock
  }
  feedItem: {
    findMany: jest.Mock
    findFirst: jest.Mock
    findUnique: jest.Mock
    create: jest.Mock
    update: jest.Mock
  }
  feedStockEntry: {
    deleteMany: jest.Mock
  }
  feedRation: {
    deleteMany: jest.Mock
  }
}

function setSession(session: MockSession) {
  mockedGetServerSession.mockResolvedValue(session as never)
}

function ownerSession() {
  setSession({ user: { id: 'owner-1', role: Role.OWNER } })
}

function workerSession() {
  setSession({ user: { id: 'worker-1', role: Role.WORKER } })
}

function noSession() {
  setSession(null)
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

beforeEach(() => {
  jest.resetAllMocks()
})

describe('settings module APIs', () => {
  test('GET /api/pens unauthenticated -> 401', async () => {
    noSession()
    const response = await getPens(new Request('http://localhost/api/pens') as never)
    expect(response.status).toBe(401)
  })

  test('GET /api/pens worker role -> 403', async () => {
    workerSession()
    const response = await getPens(new Request('http://localhost/api/pens') as never)
    expect(response.status).toBe(403)
  })

  test('POST /api/pens unauthenticated -> 401', async () => {
    noSession()
    const response = await postPens(
      jsonRequest('http://localhost/api/pens', 'POST', { name: 'Pen A', capacity: 10 }) as never,
    )
    expect(response.status).toBe(401)
  })

  test('POST /api/pens worker role -> 403', async () => {
    workerSession()
    const response = await postPens(
      jsonRequest('http://localhost/api/pens', 'POST', { name: 'Pen A', capacity: 10 }) as never,
    )
    expect(response.status).toBe(403)
  })

  test('PUT /api/pens/[id] unauthenticated -> 401', async () => {
    noSession()
    const response = await putPenById(
      jsonRequest('http://localhost/api/pens/cmf2v6ntp0000w5f3f8n4u5o1', 'PUT', { name: 'Renamed' }) as never,
      { params: { id: 'cmf2v6ntp0000w5f3f8n4u5o1' } },
    )
    expect(response.status).toBe(401)
  })

  test('PUT /api/pens/[id] worker role -> 403', async () => {
    workerSession()
    const response = await putPenById(
      jsonRequest('http://localhost/api/pens/cmf2v6ntp0000w5f3f8n4u5o1', 'PUT', { name: 'Renamed' }) as never,
      { params: { id: 'cmf2v6ntp0000w5f3f8n4u5o1' } },
    )
    expect(response.status).toBe(403)
  })

  test('GET /api/feed/items unauthenticated -> 401', async () => {
    noSession()
    const response = await getFeedItems(new Request('http://localhost/api/feed/items') as never)
    expect(response.status).toBe(401)
  })

  test('GET /api/feed/items worker role -> 403', async () => {
    workerSession()
    const response = await getFeedItems(new Request('http://localhost/api/feed/items') as never)
    expect(response.status).toBe(403)
  })

  test('POST /api/feed/items unauthenticated -> 401', async () => {
    noSession()
    const response = await postFeedItems(
      jsonRequest('http://localhost/api/feed/items', 'POST', { name: 'Maize', unit: 'KG' }) as never,
    )
    expect(response.status).toBe(401)
  })

  test('POST /api/feed/items worker role -> 403', async () => {
    workerSession()
    const response = await postFeedItems(
      jsonRequest('http://localhost/api/feed/items', 'POST', { name: 'Maize', unit: 'KG' }) as never,
    )
    expect(response.status).toBe(403)
  })

  test('PUT /api/feed/items/[id] unauthenticated -> 401', async () => {
    noSession()
    const response = await putFeedItemById(
      jsonRequest('http://localhost/api/feed/items/cmf2v6ntp0000w5f3f8n4u5o1', 'PUT', { unit: 'KG' }) as never,
      { params: { id: 'cmf2v6ntp0000w5f3f8n4u5o1' } },
    )
    expect(response.status).toBe(401)
  })

  test('PUT /api/feed/items/[id] worker role -> 403', async () => {
    workerSession()
    const response = await putFeedItemById(
      jsonRequest('http://localhost/api/feed/items/cmf2v6ntp0000w5f3f8n4u5o1', 'PUT', { unit: 'KG' }) as never,
      { params: { id: 'cmf2v6ntp0000w5f3f8n4u5o1' } },
    )
    expect(response.status).toBe(403)
  })

  test('GET /api/settings unauthenticated -> 401', async () => {
    noSession()
    const response = await getSettings(new Request('http://localhost/api/settings') as never)
    expect(response.status).toBe(401)
  })

  test('PUT /api/settings unauthenticated -> 401', async () => {
    noSession()
    const response = await putSettings(
      jsonRequest('http://localhost/api/settings', 'PUT', { marketPricePerKg: 250 }) as never,
    )
    expect(response.status).toBe(401)
  })

  test('PUT /api/settings worker role -> 403', async () => {
    workerSession()
    const response = await putSettings(
      jsonRequest('http://localhost/api/settings', 'PUT', { marketPricePerKg: 250 }) as never,
    )
    expect(response.status).toBe(403)
  })

  test('GET /api/settings first run upserts defaults and returns 200', async () => {
    ownerSession()
    mockedPrisma.appSettings.upsert.mockResolvedValue({
      id: 'global',
      marketPricePerKg: 0,
      sellCycleDays: 90,
      expenseAllocationMethod: 'PROPORTIONAL_WEIGHT',
    })

    const response = await getSettings(new Request('http://localhost/api/settings') as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'global',
      marketPricePerKg: 0,
      sellCycleDays: 90,
      expenseAllocationMethod: 'PROPORTIONAL_WEIGHT',
    })
    expect(mockedPrisma.appSettings.upsert).toHaveBeenCalledTimes(1)
  })

  test('PUT /api/settings valid update persists and returns 200', async () => {
    ownerSession()
    mockedPrisma.appSettings.update.mockResolvedValue({
      id: 'global',
      marketPricePerKg: 250,
      sellCycleDays: 90,
      expenseAllocationMethod: 'PROPORTIONAL_WEIGHT',
    })

    const response = await putSettings(
      jsonRequest('http://localhost/api/settings', 'PUT', {
        marketPricePerKg: 250,
        sellCycleDays: 90,
      }) as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'global',
      marketPricePerKg: 250,
      sellCycleDays: 90,
      expenseAllocationMethod: 'PROPORTIONAL_WEIGHT',
    })
  })

  test('PUT /api/settings invalid allocation method -> 400', async () => {
    ownerSession()

    const response = await putSettings(
      jsonRequest('http://localhost/api/settings', 'PUT', {
        expenseAllocationMethod: 'INVALID',
      }) as never,
    )

    expect(response.status).toBe(400)
  })

  test('POST /api/pens valid pen -> 201 with expected fields', async () => {
    ownerSession()
    mockedPrisma.pen.findFirst.mockResolvedValue(null)
    mockedPrisma.pen.create.mockResolvedValue({
      id: 'pen-1',
      name: 'Pen A',
      capacity: 10,
      isActive: true,
    })

    const response = await postPens(
      jsonRequest('http://localhost/api/pens', 'POST', {
        name: 'Pen A',
        capacity: 10,
      }) as never,
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: 'pen-1',
      name: 'Pen A',
      capacity: 10,
      isActive: true,
    })
  })

  test('POST /api/pens duplicate name -> 409', async () => {
    ownerSession()
    mockedPrisma.pen.findFirst.mockResolvedValue({ id: 'existing' })

    const response = await postPens(
      jsonRequest('http://localhost/api/pens', 'POST', {
        name: 'Pen A',
        capacity: 10,
      }) as never,
    )

    expect(response.status).toBe(409)
  })

  test('GET /api/pens returns activeCowCount and occupancyPct', async () => {
    ownerSession()
    mockedPrisma.pen.findMany.mockResolvedValue([
      {
        id: 'pen-1',
        name: 'Pen A',
        capacity: 10,
        isActive: true,
      },
    ])
    mockedPrisma.cow.count.mockResolvedValueOnce(2)

    const response = await getPens(new Request('http://localhost/api/pens') as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        id: 'pen-1',
        name: 'Pen A',
        capacity: 10,
        isActive: true,
        activeCowCount: 2,
        occupancyPct: 20,
      },
    ])
  })

  test('GET /api/pens capacity 0 returns occupancyPct 0', async () => {
    ownerSession()
    mockedPrisma.pen.findMany.mockResolvedValue([
      {
        id: 'pen-2',
        name: 'Pen B',
        capacity: 0,
        isActive: true,
      },
    ])
    mockedPrisma.cow.count.mockResolvedValueOnce(3)

    const response = await getPens(new Request('http://localhost/api/pens') as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        id: 'pen-2',
        name: 'Pen B',
        capacity: 0,
        isActive: true,
        activeCowCount: 3,
        occupancyPct: 0,
      },
    ])
  })

  test('PUT /api/pens/[id] isActive=false with active cows -> 409', async () => {
    ownerSession()
    mockedPrisma.pen.findUnique.mockResolvedValue({
      id: 'cmf2v6ntp0000w5f3f8n4u5o1',
      name: 'Pen A',
      capacity: 10,
      isActive: true,
    })
    mockedPrisma.cow.count.mockResolvedValueOnce(1)

    const response = await putPenById(
      jsonRequest('http://localhost/api/pens/cmf2v6ntp0000w5f3f8n4u5o1', 'PUT', { isActive: false }) as never,
      { params: { id: 'cmf2v6ntp0000w5f3f8n4u5o1' } },
    )

    expect(response.status).toBe(409)
  })

  test('PUT /api/pens/[id] isActive=false with no active cows -> 200', async () => {
    ownerSession()
    mockedPrisma.pen.findUnique.mockResolvedValue({
      id: 'cmf2v6ntp0000w5f3f8n4u5o1',
      name: 'Pen A',
      capacity: 10,
      isActive: true,
    })
    mockedPrisma.cow.count.mockResolvedValueOnce(0)
    mockedPrisma.pen.update.mockResolvedValue({
      id: 'cmf2v6ntp0000w5f3f8n4u5o1',
      name: 'Pen A',
      capacity: 10,
      isActive: false,
    })

    const response = await putPenById(
      jsonRequest('http://localhost/api/pens/cmf2v6ntp0000w5f3f8n4u5o1', 'PUT', { isActive: false }) as never,
      { params: { id: 'cmf2v6ntp0000w5f3f8n4u5o1' } },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'cmf2v6ntp0000w5f3f8n4u5o1',
      name: 'Pen A',
      capacity: 10,
      isActive: false,
    })
  })

  test('GET /api/pens excludes inactive unless includeInactive=true', async () => {
    ownerSession()
    mockedPrisma.pen.findMany.mockResolvedValue([])

    await getPens(new Request('http://localhost/api/pens') as never)
    expect(mockedPrisma.pen.findMany).toHaveBeenNthCalledWith(1, {
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    })

    mockedPrisma.pen.findMany.mockResolvedValue([])
    await getPens(new Request('http://localhost/api/pens?includeInactive=true') as never)
    expect(mockedPrisma.pen.findMany).toHaveBeenNthCalledWith(2, {
      where: undefined,
      orderBy: { createdAt: 'asc' },
    })
  })

  test('POST /api/feed/items valid -> 201', async () => {
    ownerSession()
    mockedPrisma.feedItem.findFirst.mockResolvedValue(null)
    mockedPrisma.feedItem.create.mockResolvedValue({
      id: 'item-1',
      name: 'Maize',
      unit: 'KG',
      isActive: true,
    })

    const response = await postFeedItems(
      jsonRequest('http://localhost/api/feed/items', 'POST', {
        name: 'Maize',
        unit: 'KG',
      }) as never,
    )

    expect(response.status).toBe(201)
  })

  test('POST /api/feed/items duplicate name -> 409', async () => {
    ownerSession()
    mockedPrisma.feedItem.findFirst.mockResolvedValue({ id: 'existing' })

    const response = await postFeedItems(
      jsonRequest('http://localhost/api/feed/items', 'POST', {
        name: 'Maize',
        unit: 'KG',
      }) as never,
    )

    expect(response.status).toBe(409)
  })

  test('PUT /api/feed/items/[id] isActive=false -> 200 and no historical delete', async () => {
    ownerSession()
    mockedPrisma.feedItem.findUnique.mockResolvedValue({
      id: 'cmf2v6ntp0000w5f3f8n4u5o1',
      name: 'Maize',
      unit: 'KG',
      isActive: true,
    })
    mockedPrisma.feedItem.update.mockResolvedValue({
      id: 'cmf2v6ntp0000w5f3f8n4u5o1',
      name: 'Maize',
      unit: 'KG',
      isActive: false,
    })

    const response = await putFeedItemById(
      jsonRequest('http://localhost/api/feed/items/cmf2v6ntp0000w5f3f8n4u5o1', 'PUT', { isActive: false }) as never,
      { params: { id: 'cmf2v6ntp0000w5f3f8n4u5o1' } },
    )

    expect(response.status).toBe(200)
    expect(mockedPrisma.feedStockEntry.deleteMany).not.toHaveBeenCalled()
    expect(mockedPrisma.feedRation.deleteMany).not.toHaveBeenCalled()
  })

  test('PUT /api/feed/items/[id] non-existent item -> 404', async () => {
    ownerSession()
    mockedPrisma.feedItem.findUnique.mockResolvedValue(null)

    const response = await putFeedItemById(
      jsonRequest('http://localhost/api/feed/items/cmf2v6ntp0000w5f3f8n4u5o1', 'PUT', { name: 'Updated' }) as never,
      { params: { id: 'cmf2v6ntp0000w5f3f8n4u5o1' } },
    )

    expect(response.status).toBe(404)
  })

  test('PUT /api/feed/items/[id] invalid unit -> 400', async () => {
    ownerSession()

    const response = await putFeedItemById(
      jsonRequest('http://localhost/api/feed/items/cmf2v6ntp0000w5f3f8n4u5o1', 'PUT', { unit: 'INVALID' }) as never,
      { params: { id: 'cmf2v6ntp0000w5f3f8n4u5o1' } },
    )

    expect(response.status).toBe(400)
  })

  test('POST /api/pens whitespace-only name fails -> 400', async () => {
    ownerSession()

    const response = await postPens(
      jsonRequest('http://localhost/api/pens', 'POST', {
        name: '    ',
        capacity: 10,
      }) as never,
    )

    expect(response.status).toBe(400)
  })

  test('POST /api/feed/items whitespace-only name fails -> 400', async () => {
    ownerSession()

    const response = await postFeedItems(
      jsonRequest('http://localhost/api/feed/items', 'POST', {
        name: '    ',
        unit: 'KG',
      }) as never,
    )

    expect(response.status).toBe(400)
  })
})
