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

// Track whether viewport is narrow enough that we need pagination.
function useIsMobile(): boolean {
  const [m, setM] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const fn = (e: MediaQueryListEvent) => setM(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return m
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
  const [pageStart, setPageStart] = useState(0)
  const [paintMode, setPaintMode] = useState(false)

  const isMobile = useIsMobile()
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

  // Mobile: show 3 dates per page. Desktop: show all.
  const pageSize = 3
  const totalColumns = grid?.columns.length ?? 0
  const usePagination = isMobile && totalColumns > pageSize
  const columnWindow = usePagination
    ? { start: pageStart, count: pageSize }
    : undefined
  const pageCount = usePagination ? Math.ceil(totalColumns / pageSize) : 1
  const pageIdx = usePagination ? Math.floor(pageStart / pageSize) : 0

  // Clamp pagination when totalColumns changes
  useEffect(() => {
    if (usePagination && pageStart >= totalColumns) setPageStart(0)
  }, [usePagination, pageStart, totalColumns])

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
      <div className="min-h-screen flex items-center justify-center font-mono p-4">
        <div className="text-[#ff3b30]">ERR: {error ?? 'event not found'}</div>
      </div>
    )

  // Row height: bigger on mobile so drag-paint is comfortable with a finger.
  const rowHeight = isMobile ? 32 : 22
  const labelWidth = isMobile ? 48 : 60

  return (
    <div className="min-h-screen px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
      {/* Header strip */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between mb-5 gap-3 flex-wrap font-mono"
      >
        <div className="text-sm min-w-0 flex-1">
          <div className="text-text-dim opacity-60 text-[11px]">// event</div>
          <div className="text-text-bright truncate">
            &gt; {event.title || 'untitled'}
            <span className="blink text-text-dim ml-1">_</span>
          </div>
          <div className="text-[10px] sm:text-[11px] text-text-faint mt-1">
            tz={formatTz(viewerTz)}
            {viewerTz !== event.timezone && (
              <span className="ml-2 opacity-80 block sm:inline">
                (origin: {formatTz(event.timezone)})
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm shrink-0">
          <div className="text-[11px] text-text-faint hidden sm:block">
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
              <div className="p-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[#00ff7a]">&gt;</span>
                <span className="text-text-dim text-xs">USER:</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && commitName(name)}
                  placeholder="your_name"
                  autoFocus
                  className="flex-1 min-w-0 bg-transparent text-text placeholder-text-faint focus:outline-none"
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

      {/* Pagination bar — only when needed (mobile w/ many dates) */}
      {usePagination && (
        <div className="mb-3 flex items-center justify-between text-[11px] text-text-dim font-mono">
          <button
            disabled={pageStart === 0}
            onClick={() => setPageStart((s) => Math.max(0, s - pageSize))}
            className="border border-[#ffb000]/30 hover:border-[#ffb000] disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
          >
            &lt;&lt;
          </button>
          <div className="text-text-faint">
            dates {pageStart + 1}-{Math.min(totalColumns, pageStart + pageSize)} / {totalColumns}
            <span className="ml-2 opacity-60">[p{pageIdx + 1}/{pageCount}]</span>
          </div>
          <button
            disabled={pageStart + pageSize >= totalColumns}
            onClick={() => setPageStart((s) => Math.min(totalColumns - 1, s + pageSize))}
            className="border border-[#ffb000]/30 hover:border-[#ffb000] disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
          >
            &gt;&gt;
          </button>
        </div>
      )}

      {/* Two panels — side by side on desktop, stacked on mobile */}
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <Frame
            title="YOUR.AVAILABILITY"
            right={
              <div className="flex items-center gap-2">
                {isMobile && committedName && (
                  <button
                    onClick={() => setPaintMode((v) => !v)}
                    className={[
                      'text-[10px] tracking-[0.15em] px-2 py-0.5 border transition-colors',
                      paintMode
                        ? 'border-[#ffb000] bg-[#ffb000] text-[#0a0806] [text-shadow:none]'
                        : 'border-[#ffb000]/40 text-text-dim',
                    ].join(' ')}
                  >
                    {paintMode ? '[ PAINT ON ]' : '[ PAINT ]'}
                  </button>
                )}
                <div className="text-[11px] text-text-faint">
                  [{selected.size.toString().padStart(3, '0')}]
                </div>
              </div>
            }
          >
            <div className="p-2">
              <div className="text-[11px] text-text-dim mb-2 px-1">
                {committedName ? (
                  isMobile ? (
                    paintMode ? (
                      <>&gt; paint on · drag to paint range · tap toggles one</>
                    ) : (
                      <>&gt; tap slot to toggle · enable PAINT to drag ranges</>
                    )
                  ) : (
                    <>&gt; {committedName} · drag to mark free</>
                  )
                ) : (
                  <>&gt; awaiting login…</>
                )}
              </div>
              <div
                className={[
                  'overflow-hidden',
                  !committedName ? 'opacity-30 pointer-events-none' : '',
                ].join(' ')}
              >
                <AvailabilityGrid
                  grid={grid}
                  mode="edit"
                  selected={selected}
                  onSelectedChange={setSelected}
                  columnWindow={columnWindow}
                  rowHeight={rowHeight}
                  labelWidth={labelWidth}
                  touchPaint={!isMobile || paintMode}
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
            title="GROUP.AVAILABILITY"
            variant="green"
            right={<ResponderChips names={allNames} />}
          >
            <div className="p-2">
              <div className="text-[11px] text-text-dim mb-2 px-1">
                {hoverInfo ? (
                  <>&gt; {hoverInfo.available.length}/{totalResponders} free</>
                ) : totalResponders === 0 ? (
                  <>&gt; no peers — share link</>
                ) : (
                  <>&gt; hover to inspect</>
                )}
              </div>

              <div className="overflow-hidden">
                <AvailabilityGrid
                  grid={grid}
                  mode="view"
                  heat={heat}
                  totalResponders={totalResponders}
                  onHoverSlot={setHoverSlot}
                  columnWindow={columnWindow}
                  rowHeight={rowHeight}
                  labelWidth={labelWidth}
                  touchPaint={!isMobile}
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
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                      <div className="flex-1 min-w-0">
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
                        <div className="flex-1 min-w-0">
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
  const shown = names.slice(0, 3)
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
