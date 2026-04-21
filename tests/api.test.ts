// End-to-end HTTP test against the local dev API server (port 3001).
// Requires `npm run dev:api` to be running.

const API = 'http://localhost:3001'

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

async function j(method: string, path: string, body?: any) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}

async function main() {
  console.log('\nE2E: create → save responses → fetch')

  // Create
  const event = await j('POST', '/api/events', {
    title: 'Team sync',
    dates: ['2026-06-15', '2026-06-16'],
    startHour: 9,
    endHour: 11,
    timezone: 'America/New_York',
  })
  eq('event has id', typeof event.id, 'string')
  eq('event stores timezone', event.timezone, 'America/New_York')
  eq('event stores dates', event.dates, ['2026-06-15', '2026-06-16'])

  // Save Alice's response
  const aliceSlots = ['2026-06-15T13:00:00.000Z', '2026-06-15T13:30:00.000Z']
  const alice = await j('POST', `/api/events/${event.id}`, {
    name: 'Alice',
    slots: aliceSlots,
  })
  eq('alice saved', alice.name, 'Alice')
  eq('alice slots', alice.slots, aliceSlots)

  // Save Bob (overlapping)
  const bobSlots = ['2026-06-15T13:30:00.000Z', '2026-06-15T14:00:00.000Z']
  await j('POST', `/api/events/${event.id}`, { name: 'Bob', slots: bobSlots })

  // Update Alice (upsert)
  await j('POST', `/api/events/${event.id}`, {
    name: 'Alice',
    slots: [...aliceSlots, '2026-06-15T14:00:00.000Z'],
  })

  // Fetch
  const fetched = await j('GET', `/api/events/${event.id}`)
  eq('event has 2 responses', fetched.responses.length, 2)
  const names = fetched.responses.map((r: any) => r.name).sort()
  eq('response names', names, ['Alice', 'Bob'])

  const aliceR = fetched.responses.find((r: any) => r.name === 'Alice')
  eq('alice was upserted (now 3 slots)', aliceR.slots.length, 3)

  // 404 behavior
  const r = await fetch(API + '/api/events/does-not-exist')
  eq('404 for missing', r.status, 404)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
