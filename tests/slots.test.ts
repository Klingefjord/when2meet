// Minimal, dependency-free tests for timezone projection logic. Run with:
//   npx tsx tests/slots.test.ts

import { buildEventSlots, projectToLocal } from '../src/lib/slots'

let passed = 0
let failed = 0

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}\n      expected: ${e}\n      actual:   ${a}`)
  }
}

function section(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

// Helper: given a viewer tz, project event slots back and pull out the
// local-date/hour info for one specific absolute instant.
function peek(slotsIso: string[], viewerTz: string) {
  const grid = projectToLocal(
    slotsIso.map((iso) => ({ iso, ms: +new Date(iso) })),
    viewerTz,
  )
  // Find each (col, row) that has a cell; return { colKey, rowIdx, iso }.
  const out: Array<{ colKey: string; rowIdx: number; iso: string; hour: number; minute: 0 | 30 }> = []
  for (const [k, iso] of grid.cell.entries()) {
    const [colKey, rowStr] = k.split('|')
    const rowIdx = Number(rowStr)
    out.push({
      colKey,
      rowIdx,
      iso,
      hour: grid.rows[rowIdx].hour,
      minute: grid.rows[rowIdx].minute,
    })
  }
  return { grid, cells: out.sort((a, b) => a.iso.localeCompare(b.iso)) }
}

section('buildEventSlots — count and ordering', () => {
  const slots = buildEventSlots(['2026-06-15', '2026-06-16'], 9, 11, 'America/New_York')
  // 2 days * 2 hours * 2 (half-hour) = 8 slots
  eq('slot count', slots.length, 8)
  // sorted chronologically
  const sorted = [...slots].sort((a, b) => a.ms - b.ms).map((s) => s.iso)
  eq('slots are in chronological order', slots.map((s) => s.iso), sorted)
})

section('NYC creator, NYC viewer — grid mirrors creator window', () => {
  const slots = buildEventSlots(['2026-06-15'], 9, 11, 'America/New_York')
  const { grid } = peek(slots.map((s) => s.iso), 'America/New_York')
  eq('one column', grid.columns.length, 1)
  eq('column date is 2026-06-15', grid.columns[0].key, '2026-06-15')
  eq('rows span 9:00..10:30 (four half-hour rows)', grid.rows.length, 4)
  eq('first row is 9:00', { h: grid.rows[0].hour, m: grid.rows[0].minute }, { h: 9, m: 0 })
  eq('last row is 10:30', { h: grid.rows[3].hour, m: grid.rows[3].minute }, { h: 10, m: 30 })
})

section('NYC creator, London viewer — shifted +5h in summer (BST is UTC+1, NY is UTC-4)', () => {
  // 2026-06-15 09:00 New_York = 13:00 UTC = 14:00 London (BST).
  const slots = buildEventSlots(['2026-06-15'], 9, 11, 'America/New_York')
  const { grid } = peek(slots.map((s) => s.iso), 'Europe/London')
  eq('still one column in London', grid.columns.length, 1)
  eq('London column is 2026-06-15', grid.columns[0].key, '2026-06-15')
  // First row in London should be 14:00
  eq('London first row is 14:00', { h: grid.rows[0].hour, m: grid.rows[0].minute }, { h: 14, m: 0 })
  eq('London last row is 15:30', { h: grid.rows[grid.rows.length - 1].hour, m: grid.rows[grid.rows.length - 1].minute }, { h: 15, m: 30 })
})

section('NYC creator, Tokyo viewer — crosses midnight', () => {
  // 2026-06-15 21:00 NY (EDT, UTC-4) = 2026-06-16 01:00 UTC = 2026-06-16 10:00 Tokyo
  const slots = buildEventSlots(['2026-06-15'], 21, 23, 'America/New_York')
  const { grid } = peek(slots.map((s) => s.iso), 'Asia/Tokyo')
  eq('Tokyo sees these slots on 2026-06-16', grid.columns[0].key, '2026-06-16')
  eq('Tokyo first row is 10:00', { h: grid.rows[0].hour, m: grid.rows[0].minute }, { h: 10, m: 0 })
})

section('projectToLocal — absolute identity', () => {
  // Whatever tz we project into, the iso in each cell must be the same
  // absolute instant we fed in.
  const slots = buildEventSlots(['2026-06-15'], 9, 11, 'America/New_York')
  const isoIn = new Set(slots.map((s) => s.iso))
  for (const tz of ['America/Los_Angeles', 'Asia/Tokyo', 'Europe/London', 'UTC']) {
    const { grid } = peek(slots.map((s) => s.iso), tz)
    const isoOut = new Set(Array.from(grid.cell.values()))
    eq(`${tz}: same set of absolute instants`, [...isoOut].sort(), [...isoIn].sort())
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
