// Shared data-access layer.
//
// When DATABASE_URL is set we use Prisma + Postgres. When it isn't (e.g. local
// dev without Neon), we fall back to an in-memory store so the full flow can
// be exercised without any infra. The in-memory store exposes the narrow
// subset of Prisma's API that our /api/* handlers actually use.

type DB = {
  event: {
    create: (args: { data: EventRow }) => Promise<EventRow>
    findUnique: (args: { where: { id: string }; include?: any }) => Promise<EventWithResponses | null>
  }
  response: {
    upsert: (args: {
      where: { eventId_name: { eventId: string; name: string } }
      create: ResponseRow
      update: { slots: string[] }
    }) => Promise<ResponseRow>
  }
}

type EventRow = {
  id: string
  title: string
  dates: string[]
  startHour: number
  endHour: number
  timezone: string
  createdAt?: Date | string
}

type ResponseRow = {
  id?: string
  eventId: string
  name: string
  slots: string[]
  createdAt?: Date | string
  updatedAt?: Date | string
}

type EventWithResponses = EventRow & {
  createdAt: Date | string
  responses: Array<Pick<ResponseRow, 'id' | 'name' | 'slots'> & { updatedAt: Date | string }>
}

function makeInMemoryDB(): DB {
  const events = new Map<string, EventRow & { createdAt: Date }>()
  const responses = new Map<string, Required<ResponseRow> & { createdAt: Date; updatedAt: Date }>()
  const rkey = (eventId: string, name: string) => `${eventId}::${name}`

  return {
    event: {
      async create({ data }) {
        const row = { ...data, createdAt: new Date() }
        events.set(row.id, row)
        return row
      },
      async findUnique({ where }) {
        const ev = events.get(where.id)
        if (!ev) return null
        const resp = Array.from(responses.values())
          .filter((r) => r.eventId === ev.id)
          .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
          .map((r) => ({ id: r.id, name: r.name, slots: r.slots, updatedAt: r.updatedAt }))
        return { ...ev, responses: resp }
      },
    },
    response: {
      async upsert({ where, create, update }) {
        const k = rkey(where.eventId_name.eventId, where.eventId_name.name)
        const existing = responses.get(k)
        const now = new Date()
        if (existing) {
          const updated = { ...existing, slots: update.slots, updatedAt: now }
          responses.set(k, updated)
          return updated
        }
        const id = 'r_' + Math.random().toString(36).slice(2, 10)
        const row = {
          id,
          eventId: create.eventId,
          name: create.name,
          slots: create.slots,
          createdAt: now,
          updatedAt: now,
        }
        responses.set(k, row)
        return row
      },
    },
  }
}

async function makePrismaDB(): Promise<DB> {
  const { PrismaClient } = await import('@prisma/client')
  const globalForPrisma = globalThis as unknown as { prisma?: any }
  const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    })
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
  return prisma as unknown as DB
}

// Cache the DB promise so the in-memory store persists across requests
// and the Prisma client is reused.
declare global {
  // eslint-disable-next-line no-var
  var __w2mc_db__: Promise<DB> | undefined
}

export const dbPromise: Promise<DB> = (() => {
  if (globalThis.__w2mc_db__) return globalThis.__w2mc_db__
  const p = process.env.DATABASE_URL ? makePrismaDB() : Promise.resolve(makeInMemoryDB())
  globalThis.__w2mc_db__ = p
  if (!process.env.DATABASE_URL) {
    console.warn('[w2mc] DATABASE_URL not set — using in-memory store (data lost on restart).')
  }
  return p
})()
