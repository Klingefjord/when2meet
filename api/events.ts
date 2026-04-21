import type { VercelRequest, VercelResponse } from '@vercel/node'
import { customAlphabet } from 'nanoid'
import { dbPromise } from './_db.js'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { title, dates, startHour, endHour, timezone } = req.body as {
    title: string
    dates: string[]
    startHour: number
    endHour: number
    timezone: string
  }

  if (!Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'Missing dates' })
  }

  const db = await dbPromise
  const id = nanoid()
  const event = await db.event.create({
    data: {
      id,
      title: (title ?? '').toString().trim() || 'Untitled',
      dates,
      startHour: startHour ?? 9,
      endHour: endHour ?? 22,
      timezone: timezone ?? 'UTC',
    },
  })

  return res.status(200).json(event)
}
