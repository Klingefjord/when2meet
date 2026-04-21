import type { SlotKey } from './types'

// Slots are absolute UTC timestamps (ISO strings, minute-precision), so they
// mean the same instant for everyone. The creator picks dates + an hour range
// in *their* timezone; we materialize all the half-hour instants that fall
// inside those local windows, then let each viewer re-project them back into
// their own local timezone for display.

export type AbsSlot = { iso: string; ms: number }

// Return minutes-from-UTC for `date` in tz. (Positive = east of UTC.)
function offsetMinutes(date: Date, tz: string): number {
  // en-US locale puts the parts in a predictable order and gives us numeric
  // pieces regardless of the user's system locale.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return Math.round((asUTC - date.getTime()) / 60000)
}

// Convert a wall-clock time in `tz` (Y/M/D h:m) to an absolute Date.
function wallToInstant(
  y: number,
  mo: number, // 1..12
  d: number,
  h: number,
  m: number,
  tz: string,
): Date {
  // Start by pretending the wall-clock is UTC, then correct by the tz offset
  // at that instant (two-step dance covers DST boundary cases).
  const utcGuess = new Date(Date.UTC(y, mo - 1, d, h, m))
  const off1 = offsetMinutes(utcGuess, tz)
  const adjusted = new Date(utcGuess.getTime() - off1 * 60000)
  const off2 = offsetMinutes(adjusted, tz)
  if (off2 === off1) return adjusted
  return new Date(utcGuess.getTime() - off2 * 60000)
}

// Build every absolute slot for an event defined in the creator's timezone.
export function buildEventSlots(
  dates: string[], // "YYYY-MM-DD" in creator's tz
  startHour: number,
  endHour: number,
  creatorTz: string,
): AbsSlot[] {
  const out: AbsSlot[] = []
  for (const d of dates) {
    const [y, mo, day] = d.split('-').map(Number)
    for (let h = startHour; h < endHour; h++) {
      for (const m of [0, 30]) {
        const instant = wallToInstant(y, mo, day, h, m, creatorTz)
        out.push({ iso: instant.toISOString(), ms: instant.getTime() })
      }
    }
  }
  return out
}

// Project absolute slots into the viewer's local timezone, grouping by local
// date and half-hour row. Returns the columns (dates) and rows needed to
// render the grid, plus a lookup from (col, row) to slot ISO.
export type LocalGrid = {
  columns: Array<{ key: string; label: { weekday: string; day: string; month: string } }>
  rows: Array<{ hour: number; minute: 0 | 30; label: string | null }>
  // key = `${colKey}|${rowIdx}` -> slot iso
  cell: Map<string, string>
}

export function projectToLocal(slots: AbsSlot[], viewerTz: string): LocalGrid {
  // For each slot, compute local date + (hour, minute) in the viewer's tz.
  type Local = { iso: string; dateKey: string; hour: number; minute: 0 | 30 }
  const locals: Local[] = []
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: viewerTz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  for (const s of slots) {
    const parts = Object.fromEntries(
      dtf.formatToParts(new Date(s.ms)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
    ) as Record<string, string>
    const y = parts.year
    const mo = parts.month
    const day = parts.day
    const hour = Number(parts.hour === '24' ? '0' : parts.hour)
    const minute = Number(parts.minute)
    const roundedMin = minute < 30 ? 0 : 30
    locals.push({
      iso: s.iso,
      dateKey: `${y}-${mo}-${day}`,
      hour,
      minute: roundedMin as 0 | 30,
    })
  }

  // Distinct sorted columns (dates).
  const colKeys = Array.from(new Set(locals.map((l) => l.dateKey))).sort()
  const columns = colKeys.map((k) => ({
    key: k,
    label: formatDateShortInTz(k),
  }))

  // Determine min/max hour across locals so rows span the real projected window.
  let minTicks = Number.POSITIVE_INFINITY
  let maxTicks = Number.NEGATIVE_INFINITY
  for (const l of locals) {
    const t = l.hour * 2 + (l.minute === 30 ? 1 : 0)
    if (t < minTicks) minTicks = t
    if (t > maxTicks) maxTicks = t
  }
  if (!isFinite(minTicks)) {
    minTicks = 0
    maxTicks = 0
  }

  const rows: LocalGrid['rows'] = []
  for (let t = minTicks; t <= maxTicks; t++) {
    const hour = Math.floor(t / 2)
    const minute: 0 | 30 = t % 2 === 0 ? 0 : 30
    rows.push({
      hour,
      minute,
      label: minute === 0 ? formatHour(hour) : null,
    })
  }

  const cell = new Map<string, string>()
  for (const l of locals) {
    const rowIdx = l.hour * 2 + (l.minute === 30 ? 1 : 0) - minTicks
    cell.set(`${l.dateKey}|${rowIdx}`, l.iso)
  }

  return { columns, rows, cell }
}

export function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr} ${period}`
}

export function formatDateShortInTz(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(iso + 'T12:00:00')
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.toLocaleDateString(undefined, { day: 'numeric' }),
    month: d.toLocaleDateString(undefined, { month: 'short' }),
  }
}

// Back-compat alias used by Landing.tsx (still its own local calendar picker).
export const formatDateShort = formatDateShortInTz

// Legacy slot key builder used by the landing-page time range picker only.
export function slotKey(_date: string, hour: number, _minute: 0 | 30): string {
  // Not used in the new absolute-slot flow; kept so older callers compile.
  // Returns an opaque string.
  return String(hour)
}

export function parseSlot(iso: SlotKey): { date: string; hour: number; minute: number } {
  const d = new Date(iso)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return {
    date: `${y}-${mo}-${day}`,
    hour: d.getHours(),
    minute: d.getMinutes(),
  }
}

// Build time rows spanning a full [startHour, endHour) range in the creator's
// tz — only used where a viewer-agnostic row layout is needed. Most code
// should use `projectToLocal` instead.
export function buildTimeRows(
  startHour: number,
  endHour: number,
): Array<{ hour: number; minute: 0 | 30; label: string | null }> {
  const rows: Array<{ hour: number; minute: 0 | 30; label: string | null }> = []
  for (let h = startHour; h < endHour; h++) {
    rows.push({ hour: h, minute: 0, label: formatHour(h) })
    rows.push({ hour: h, minute: 30, label: null })
  }
  return rows
}
