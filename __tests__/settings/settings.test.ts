/** @jest-environment node */
import { AllocationMethod, FeedUnit, Role } from '@prisma/client'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    appSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    pen: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cow: {
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    feedItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

import { POST as feedItemsPOST } from '@/app/api/feed/items/route'
import { GET as pensGET, POST as pensPOST } from '@/app/api/pens/route'
import { PUT as penByIdPUT } from '@/app/api/pens/[id]/route'
import { GET as settingsGET, PUT as settingsPUT } from '@/app/api/settings/route'
import { prisma as prismaClient } from '@/lib/prisma'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prismaClient as unknown as {
  appSettings: {
    findUnique: jest.Mock
    upsert: jest.Mock
  }
  pen: {
    findMany: jest.Mock
    findUnique: jest.Mock
    findFirst: jest.Mock
    create: jest.Mock
    update: jest.Mock
  }
  cow: {
    groupBy: jest.Mock
    count: jest.Mock
  }
  feedItem: {
    findMany: jest.Mock
    findUnique: jest.Mock
    findFirst: jest.Mock
    create: jest.Mock
    update: jest.Mock
  }
  $transaction: jest.Mock
}

const ownerSession = {
  user: {
    id: 'owner-1',
    role: Role.OWNER,
    email: 'owner@example.com',
    name: 'Owner',
  },
}

const workerSession = {
  user: {
    id: 'worker-1',
    role: Role.WORKER,
    email: 'worker@example.com',
    name: 'Worker',
  },
}

function jsonRequest(url: string, method: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('settings module routes', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetServerSession.mockResolvedValue(ownerSession)
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        cow: {
          count: mockPrisma.cow.count,
        },
        pen: {
          update: mockPrisma.pen.update,
        },
      }),
    )
  })

  it('GET /api/settings: AppSettings row absent -> upsert defaults -> 200', async () => {
    mockPrisma.appSettings.upsert.mockResolvedValue({
      id: 'global',
      marketPricePerKg: 0,
      sellCycleDays: 90,
      expenseAllocationMethod: AllocationMethod.PROPORTIONAL_WEIGHT,
    })

    const response = await settingsGET()

    expect(response.status).toBe(200)
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'global' },
        update: {},
        create: expect.objectContaining({
          id: 'global',
          marketPricePerKg: 0,
          sellCycleDays: 90,
          expenseAllocationMethod: AllocationMethod.PROPORTIONAL_WEIGHT,
        }),
      }),
    )
  })

  it('PUT /api/settings: valid partial update -> 200', async () => {
    mockPrisma.appSettings.upsert.mockResolvedValue({
      id: 'global',
      marketPricePerKg: 620,
      sellCycleDays: 90,
      expenseAllocationMethod: AllocationMethod.EQUAL_SPLIT,
    })

    const response = await settingsPUT(
      jsonRequest('http://localhost/api/settings', 'PUT', {
        marketPricePerKg: 620,
        expenseAllocationMethod: AllocationMethod.EQUAL_SPLIT,
      }) as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'global',
      marketPricePerKg: 620,
      sellCycleDays: 90,
      expenseAllocationMethod: AllocationMethod.EQUAL_SPLIT,
    })
  })

  it('POST /api/pens: valid body -> 201', async () => {
    mockPrisma.pen.findFirst.mockResolvedValue(null)
    mockPrisma.pen.create.mockResolvedValue({
      id: 'cm12345678901234567890123',
      name: 'Pen A',
      capacity: 30,
      isActive: true,
    })

    const response = await pensPOST(
      jsonRequest('http://localhost/api/pens', 'POST', {
        name: 'Pen A',
        capacity: 30,
      }) as never,
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: 'cm12345678901234567890123',
      name: 'Pen A',
      capacity: 30,
      isActive: true,
    })
  })

  it('PUT /api/pens/[id]: deactivate with active cows -> 409', async () => {
    mockPrisma.pen.findUnique.mockResolvedValue({
      id: 'cm12345678901234567890123',
      name: 'Pen A',
      isActive: true,
    })
    mockPrisma.cow.count.mockResolvedValue(4)

    const response = await penByIdPUT(
      jsonRequest('http://localhost/api/pens/cm12345678901234567890123', 'PUT', { isActive: false }) as never,
      { params: { id: 'cm12345678901234567890123' } },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Pen has active cows. Move them before deactivating.',
    })
  })

  it('PUT /api/pens/[id]: deactivate with no active cows -> 200 and excluded from default active list', async () => {
    mockPrisma.pen.findUnique.mockResolvedValue({
      id: 'cm12345678901234567890123',
      name: 'Pen A',
      isActive: true,
    })
    mockPrisma.cow.count.mockResolvedValue(0)
    mockPrisma.pen.update.mockResolvedValue({
      id: 'cm12345678901234567890123',
      name: 'Pen A',
      capacity: 30,
      isActive: false,
    })
    mockPrisma.pen.findMany.mockResolvedValue([])
    mockPrisma.cow.groupBy.mockResolvedValue([])

    const deactivateResponse = await penByIdPUT(
      jsonRequest('http://localhost/api/pens/cm12345678901234567890123', 'PUT', { isActive: false }) as never,
      { params: { id: 'cm12345678901234567890123' } },
    )
    const listResponse = await pensGET(new NextRequest('http://localhost/api/pens') as never)

    expect(deactivateResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual([])
  })

  it('POST /api/feed/items: duplicate active name -> 409', async () => {
    mockPrisma.feedItem.findFirst.mockResolvedValue({ id: 'existing-feed' })

    const response = await feedItemsPOST(
      jsonRequest('http://localhost/api/feed/items', 'POST', {
        name: 'Silage',
        unit: FeedUnit.KG,
      }) as never,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Feed item name already exists' })
  })

  it('PUT /api/settings: WORKER session -> 403', async () => {
    mockGetServerSession.mockResolvedValue(workerSession)

    const response = await settingsPUT(
      jsonRequest('http://localhost/api/settings', 'PUT', {
        sellCycleDays: 120,
      }) as never,
    )

    expect(response.status).toBe(403)
  })

  it('GET /api/settings: no session -> 401', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const response = await settingsGET()

    expect(response.status).toBe(401)
  })

  it('POST /api/pens: no session -> 401', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const response = await pensPOST(
      jsonRequest('http://localhost/api/pens', 'POST', {
        name: 'Pen A',
        capacity: 30,
      }) as never,
    )

    expect(response.status).toBe(401)
  })

  it('POST /api/feed/items: no session -> 401', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const response = await feedItemsPOST(
      jsonRequest('http://localhost/api/feed/items', 'POST', {
        name: 'Silage',
        unit: FeedUnit.KG,
      }) as never,
    )

    expect(response.status).toBe(401)
  })
})
