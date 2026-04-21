import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AvailabilityGrid } from '../components/AvailabilityGrid'
import { api } from '../lib/api'
import type { Event as EventType } from '../lib/types'
import { buildEventSlots, projectToLocal } from '../lib/slots'

type SlotIso = string

const LS_NAME = 'w2mc:name'
function lsKeySelected(eventId: string, name: string) {
  return `w2mc:sel:${eventId}:${name}`
}

function formatTz(tz: string): string {
  // "America/New_York" -> "New York" ; also tack on GMT offset for clarity.
  const name = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const parts = dtf.formatToParts(new Date())
    const off = parts.find((p) => p.type === 'timeZoneName')?.value
    return off ? `${name} · ${off}` : name
  } catch {
    return name
  }
}

export function Event({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState<string>(() => localStorage.getItem(LS_NAME) ?? '')
  const [committedName, setCommittedName] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<SlotIso>>(new Set())
  const [hoverSlot, setHoverSlot] = useState<SlotIso | null>(null)
  const [copied, setCopied] = useState(false)

  const viewerTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .getEvent(eventId)
      .then((e) => {
        if (!alive) return
        setEvent(e)
        setError(null)
      })
      .catch((err) => alive && setError(err?.message ?? 'Failed to load'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [eventId])

  const commitName = (n: string) => {
    const trimmed = n.trim()
    if (!trimmed) return
    localStorage.setItem(LS_NAME, trimmed)
    setCommittedName(trimmed)

    const existing = event?.responses.find((r) => r.name === trimmed)
    if (existing) {
      setSelected(new Set(existing.slots))
    } else {
      const draft = localStorage.getItem(lsKeySelected(eventId, trimmed))
      if (draft) {
        try {
          setSelected(new Set(JSON.parse(draft) as string[]))
        } catch {}
      }
    }
  }

  // Debounced save
  const saveTimer = useRef<number | null>(null)
  const firstSave = useRef(true)
  useEffect(() => {
    if (!committedName || !event) return
    localStorage.setItem(
      lsKeySelected(eventId, committedName),
      JSON.stringify([...selected]),
    )
    if (firstSave.current) {
      firstSave.current = false
      return
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      try {
        await api.saveResponse(eventId, committedName, [...selected])
        setEvent((prev) => {
          if (!prev) return prev
          const idx = prev.responses.findIndex((r) => r.name === committedName)
          const responses = [...prev.responses]
          const now = new Date().toISOString()
          if (idx >= 0) responses[idx] = { ...responses[idx], slots: [...selected], updatedAt: now }
          else responses.push({ id: 'local-' + Date.now(), name: committedName, slots: [...selected], updatedAt: now })
          return { ...prev, responses }
        })
      } catch (err) {
        console.error(err)
      }
    }, 400)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [selected, committedName, event, eventId])

  // Absolute slots for this event (minted in creator's tz), then projected to
  // viewer's local grid. This is what lets different viewers see their own tz.
  const grid = useMemo(() => {
    if (!event) return null
    const abs = buildEventSlots(event.dates, event.startHour, event.endHour, event.timezone)
    return projectToLocal(abs, viewerTz)
  }, [event, viewerTz])

  const heat = useMemo(() => {
    const m = new Map<SlotIso, string[]>()
    if (!event) return m
    for (const r of event.responses) {
      for (const s of r.slots) {
        const arr = m.get(s) ?? []
        arr.push(r.name)
        m.set(s, arr)
      }
    }
    return m
  }, [event])

  const totalResponders = event?.responses.length ?? 0
  const allNames = useMemo(() => (event?.responses ?? []).map((r) => r.name), [event])

  const hoverInfo = useMemo(() => {
    if (!hoverSlot) return null
    const available = heat.get(hoverSlot) ?? []
    const missing = allNames.filter((n) => !available.includes(n))
    return { iso: hoverSlot, available, missing }
  }, [hoverSlot, heat, allNames])

  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/#/e/${eventId}` : ''
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-text-dim animate-pulse">Loading…</div>
      </div>
    )
  if (error || !event || !grid)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-400">{error ?? 'Event not found'}</div>
      </div>
    )

  const tzNote =
    viewerTz === event.timezone
      ? `Times shown in ${formatTz(viewerTz)}`
      : `Your timezone: ${formatTz(viewerTz)} · created in ${formatTz(event.timezone)}`

  return (
    <div className="min-h-screen px-6 py-10 max-w-7xl mx-auto">
      {/* Top bar — no big title */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between mb-6 gap-4 flex-wrap"
      >
        <div>
          <div className="text-xs uppercase tracking-wider text-text-faint">Event</div>
          <div className="text-text text-base">{event.title || 'Untitled'}</div>
          <div className="text-text-faint text-xs mt-1">{tzNote}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-text-faint mr-1">
            {totalResponders} {totalResponders === 1 ? 'person' : 'people'}
          </div>
          <button
            onClick={copyLink}
            className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-elevated border border-border hover:border-accent-500/50 transition"
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.span key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-accent-400 text-sm">
                  Copied ✓
                </motion.span>
              ) : (
                <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-text-dim group-hover:text-text">
                  Copy share link
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.div>

      {/* Name gate */}
      <AnimatePresence>
        {!committedName && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 bg-bg-elevated/50 backdrop-blur border border-border rounded-xl p-4 flex items-center gap-3"
          >
            <span className="text-sm text-text-dim">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitName(name)}
              placeholder="Enter your name to start"
              autoFocus
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-text placeholder-text-faint focus:border-accent-500 focus:outline-none"
            />
            <button
              onClick={() => commitName(name)}
              disabled={!name.trim()}
              className="px-4 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 disabled:bg-bg disabled:text-text-faint text-white transition"
            >
              Join
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-panel grid */}
      <div className="grid md:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="bg-bg-elevated/30 backdrop-blur border border-border rounded-2xl p-4"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div>
              <div className="text-xs uppercase tracking-wider text-text-faint">Your availability</div>
              <div className="text-sm text-text-dim">
                {committedName
                  ? 'Drag to paint the times you\'re free'
                  : 'Enter your name above to start'}
              </div>
            </div>
            <div className="text-xs text-text-faint">
              {selected.size} {selected.size === 1 ? 'slot' : 'slots'}
            </div>
          </div>

          <div
            className={[
              'overflow-auto max-h-[65vh] rounded-lg',
              !committedName ? 'opacity-40 pointer-events-none' : '',
            ].join(' ')}
          >
            <AvailabilityGrid
              grid={grid}
              mode="edit"
              selected={selected}
              onSelectedChange={setSelected}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-bg-elevated/30 backdrop-blur border border-border rounded-2xl p-4"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div>
              <div className="text-xs uppercase tracking-wider text-text-faint">Group availability</div>
              <div className="text-sm text-text-dim">
                {hoverInfo
                  ? `${hoverInfo.available.length}/${totalResponders} available`
                  : totalResponders === 0
                    ? 'Share the link to collect responses'
                    : 'Hover to see who\'s free'}
              </div>
            </div>
            <ResponderChips names={allNames} />
          </div>

          <div className="overflow-auto max-h-[65vh] rounded-lg">
            <AvailabilityGrid
              grid={grid}
              mode="view"
              heat={heat}
              totalResponders={totalResponders}
              onHoverSlot={setHoverSlot}
            />
          </div>

          <AnimatePresence>
            {hoverInfo && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="mt-3 bg-bg border border-border rounded-lg p-3 text-sm"
              >
                <div className="flex gap-6">
                  <div className="flex-1">
                    <div className="text-xs text-text-faint mb-1">Available</div>
                    {hoverInfo.available.length === 0 ? (
                      <div className="text-text-faint">Nobody yet</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {hoverInfo.available.map((n) => (
                          <span
                            key={n}
                            className="px-2 py-0.5 rounded-md bg-accent-500/20 border border-accent-500/30 text-accent-400 text-xs"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {hoverInfo.missing.length > 0 && (
                    <div className="flex-1">
                      <div className="text-xs text-text-faint mb-1">Unavailable</div>
                      <div className="flex flex-wrap gap-1.5">
                        {hoverInfo.missing.map((n) => (
                          <span key={n} className="px-2 py-0.5 rounded-md bg-bg-hover border border-border text-text-faint text-xs">
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

function ResponderChips({ names }: { names: string[] }) {
  if (names.length === 0) return null
  const shown = names.slice(0, 4)
  const rest = names.length - shown.length
  return (
    <div className="flex -space-x-1">
      {shown.map((n) => (
        <div
          key={n}
          title={n}
          className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-400 to-accent-600 border-2 border-bg-elevated flex items-center justify-center text-[11px] font-medium text-white"
        >
          {n.slice(0, 1).toUpperCase()}
        </div>
      ))}
      {rest > 0 && (
        <div className="w-7 h-7 rounded-full bg-bg-hover border-2 border-bg-elevated flex items-center justify-center text-[10px] text-text-dim">
          +{rest}
        </div>
      )}
    </div>
  )
}
