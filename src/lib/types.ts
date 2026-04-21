export type Event = {
  id: string
  title: string
  dates: string[] // ISO date strings, e.g. "2026-04-22"
  startHour: number
  endHour: number
  timezone: string
  createdAt: string
  responses: Response[]
}

export type Response = {
  id: string
  name: string
  slots: string[] // slot keys
  updatedAt: string
}

// A slot key encodes date + half-hour: "2026-04-22|0930" => Apr 22 9:30
export type SlotKey = string
