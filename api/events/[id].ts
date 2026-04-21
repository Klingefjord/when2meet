import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbPromise } from '../_db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query as { id: string }
  if (!id) return res.status(400).json({ error: 'Missing id' })
  const db = await dbPromise

  if (req.method === 'GET') {
    const event = await db.event.findUnique({
      where: { id },
      include: {
        responses: {
          select: { id: true, name: true, slots: true, updatedAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!event) return res.status(404).json({ error: 'Not found' })
    return res.status(200).json(event)
  }

  if (req.method === 'POST') {
    const { name, slots } = req.body as { name: string; slots: string[] }
    if (!name || !Array.isArray(slots)) {
      return res.status(400).json({ error: 'Missing name or slots' })
    }

    const response = await db.response.upsert({
      where: { eventId_name: { eventId: id, name } },
      create: { eventId: id, name, slots },
      update: { slots },
    })

    return res.status(200).json(response)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
