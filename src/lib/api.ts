import type { Event, Response } from './types'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!r.ok) {
    const body = await r.text()
    throw new Error(`${r.status}: ${body || r.statusText}`)
  }
  return r.json()
}

export const api = {
  createEvent: (payload: {
    title: string
    dates: string[]
    startHour: number
    endHour: number
    timezone: string
  }) =>
    req<Event>('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getEvent: (id: string) => req<Event>(`/api/events/${id}`),

  saveResponse: (eventId: string, name: string, slots: string[]) =>
    req<Response>(`/api/events/${eventId}`, {
      method: 'POST',
      body: JSON.stringify({ name, slots }),
    }),
}
