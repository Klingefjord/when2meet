import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AvailabilityGrid } from '../components/AvailabilityGrid'
import { Frame } from '../components/Frame'
import { api } from '../lib/api'
import type { Event as EventType } from '../lib/types'
import { buildEventSlots, projectToLocal } from '../lib/slots'

type SlotIso = string

const LS_NAME = 'w2mc:name'
function lsKeySelected(eventId: string, name: string) {
  return `w2mc:sel:${eventId}:${name}`
}

function formatTz(tz: string): string {
  const name = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const off = dtf.formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value
    return off ? `${name} ${off}` : name
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
      <div className="min-h-screen flex items-center justify-center font-mono text-text">
        <span>LOADING<span className="blink">...</span></span>
      </div>
    )
  if (error || !event || !grid)
    return (
      <div className="min-h-screen flex items-center justify-center font-mono">
        <div className="text-[#ff3b30]">ERR: {error ?? 'event not found'}</div>
      </div>
    )

  return (
    <div className="min-h-screen px-6 py-8 max-w-7xl mx-auto">
      {/* Header strip */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between mb-5 gap-4 flex-wrap font-mono"
      >
        <div className="text-sm">
          <div className="text-text-dim opacity-60">// event</div>
          <div className="text-text-bright">
            &gt; {event.title || 'untitled'}
            <span className="blink text-text-dim ml-1">_</span>
          </div>
          <div className="text-[11px] text-text-faint mt-1">
            tz={formatTz(viewerTz)}
            {viewerTz !== event.timezone && (
              <span className="ml-2 opacity-80">(origin: {formatTz(event.timezone)})</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-[11px] text-text-faint">
            peers: {totalResponders.toString().padStart(2, '0')}
          </div>
          <button
            onClick={copyLink}
            className="border border-[#ffb000]/40 hover:border-[#ffb000] px-3 py-1.5 text-xs tracking-[0.15em] transition-colors"
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.span key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[#00ff7a]">
                  [ COPIED! ]
                </motion.span>
              ) : (
                <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  [ COPY LINK ]
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
            className="mb-5"
          >
            <Frame title="LOGIN" variant="green">
              <div className="p-3 flex items-center gap-2 text-sm">
                <span className="text-[#00ff7a]">&gt;</span>
                <span className="text-text-dim text-xs">USER:</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && commitName(name)}
                  placeholder="your_name"
                  autoFocus
                  className="flex-1 bg-transparent text-text placeholder-text-faint focus:outline-none"
                />
                <button
                  onClick={() => commitName(name)}
                  disabled={!name.trim()}
                  className="border border-[#00ff7a]/50 hover:border-[#00ff7a] hover:bg-[#00ff7a]/10 disabled:opacity-30 disabled:cursor-not-allowed text-[#00ff7a] px-3 py-1 text-xs tracking-[0.2em] transition-colors"
                >
                  [ CONNECT ]
                </button>
              </div>
            </Frame>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two panels */}
      <div className="grid md:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <Frame
            title="YOU.MATRIX"
            right={
              <div className="text-[11px] text-text-faint">
                [{selected.size.toString().padStart(3, '0')}] blocks
              </div>
            }
          >
            <div className="p-2">
              <div className="text-[11px] text-text-dim mb-2 px-1">
                {committedName ? (
                  <>&gt; user={committedName} · drag to mark availability</>
                ) : (
                  <>&gt; awaiting login…</>
                )}
              </div>
              <div
                className={[
                  'overflow-auto max-h-[65vh]',
                  !committedName ? 'opacity-30 pointer-events-none' : '',
                ].join(' ')}
              >
                <AvailabilityGrid
                  grid={grid}
                  mode="edit"
                  selected={selected}
                  onSelectedChange={setSelected}
                />
              </div>
            </div>
          </Frame>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Frame
            title="GROUP.OVERLAY"
            variant="green"
            right={<ResponderChips names={allNames} />}
          >
            <div className="p-2">
              <div className="text-[11px] text-text-dim mb-2 px-1">
                {hoverInfo ? (
                  <>&gt; {hoverInfo.available.length}/{totalResponders} free</>
                ) : totalResponders === 0 ? (
                  <>&gt; no peers yet — share link to collect replies</>
                ) : (
                  <>&gt; hover grid to inspect</>
                )}
              </div>

              <div className="overflow-auto max-h-[65vh]">
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
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="mt-3 border border-[#00ff7a]/30 p-3 text-xs font-mono"
                  >
                    <div className="flex gap-6">
                      <div className="flex-1">
                        <div className="text-text-dim mb-1 text-[10px] tracking-widest">AVAILABLE</div>
                        {hoverInfo.available.length === 0 ? (
                          <div className="text-text-faint">—</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {hoverInfo.available.map((n) => (
                              <span
                                key={n}
                                className="px-1.5 py-0.5 border border-[#00ff7a]/40 text-[#00ff7a]"
                              >
                                {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {hoverInfo.missing.length > 0 && (
                        <div className="flex-1">
                          <div className="text-text-dim mb-1 text-[10px] tracking-widest">MISSING</div>
                          <div className="flex flex-wrap gap-1.5">
                            {hoverInfo.missing.map((n) => (
                              <span
                                key={n}
                                className="px-1.5 py-0.5 border border-[#443826] text-text-faint line-through decoration-[#443826]"
                              >
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
            </div>
          </Frame>
        </motion.div>
      </div>
    </div>
  )
}

function ResponderChips({ names }: { names: string[] }) {
  if (names.length === 0) return <div className="text-[10px] text-text-faint">[ empty ]</div>
  const shown = names.slice(0, 4)
  const rest = names.length - shown.length
  return (
    <div className="flex gap-1 text-[10px]">
      {shown.map((n) => (
        <span
          key={n}
          title={n}
          className="px-1 py-0.5 border border-[#00ff7a]/40 text-[#00ff7a] tracking-wider"
        >
          {n.slice(0, 3).toUpperCase()}
        </span>
      ))}
      {rest > 0 && <span className="px-1 py-0.5 border border-[#443826] text-text-faint">+{rest}</span>}
    </div>
  )
}
