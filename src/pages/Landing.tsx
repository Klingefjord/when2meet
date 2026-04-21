import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatHour } from '../lib/slots'
import { api } from '../lib/api'
import { QUOTES } from '../lib/quotes'

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function toISODate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildCalendar(monthAnchor: Date) {
  const first = startOfMonth(monthAnchor)
  const gridStart = new Date(first)
  gridStart.setDate(gridStart.getDate() - first.getDay()) // back to Sunday
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push(d)
  }
  return cells
}

export function Landing({ onCreated }: { onCreated: (id: string) => void }) {
  const today = useMemo(() => new Date(), [])
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(today))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [startHour, setStartHour] = useState(9)
  const [endHour, setEndHour] = useState(22)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drag-select state for calendar
  const dragMode = useRef<'add' | 'remove' | null>(null)

  const cells = useMemo(() => buildCalendar(monthAnchor), [monthAnchor])
  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const canSubmit = title.trim().length > 0 && selected.size > 0 && endHour > startHour

  const toggleCell = (iso: string, mode: 'add' | 'remove') => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (mode === 'add') next.add(iso)
      else next.delete(iso)
      return next
    })
  }

  const onCellDown = (d: Date, disabled: boolean) => {
    if (disabled) return
    const iso = toISODate(d)
    const mode = selected.has(iso) ? 'remove' : 'add'
    dragMode.current = mode
    toggleCell(iso, mode)
  }

  const onCellEnter = (d: Date, disabled: boolean) => {
    if (disabled || !dragMode.current) return
    toggleCell(toISODate(d), dragMode.current)
  }

  const endDrag = () => {
    dragMode.current = null
  }

  const handleCreate = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const dates = [...selected].sort()
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const event = await api.createEvent({
        title: title.trim(),
        dates,
        startHour,
        endHour,
        timezone: tz,
      })
      onCreated(event.id)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-16"
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-4xl"
      >
        <div className="grid md:grid-cols-[1fr_380px] gap-6">
          {/* Calendar */}
          <div className="bg-bg-elevated/50 backdrop-blur border border-border rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="w-9 h-9 rounded-lg hover:bg-bg-hover transition flex items-center justify-center text-text-dim hover:text-text"
                aria-label="Previous month"
              >
                ‹
              </button>
              <div className="font-medium">{monthLabel}</div>
              <button
                onClick={() => setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="w-9 h-9 rounded-lg hover:bg-bg-hover transition flex items-center justify-center text-text-dim hover:text-text"
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="text-center text-xs text-text-faint py-1">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 no-select">
              {cells.map((d) => {
                const iso = toISODate(d)
                const inMonth = d.getMonth() === monthAnchor.getMonth()
                const isPast =
                  d < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                const isSelected = selected.has(iso)
                const disabled = isPast
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={disabled}
                    onMouseDown={() => onCellDown(d, disabled)}
                    onMouseEnter={() => onCellEnter(d, disabled)}
                    className={[
                      'relative aspect-square rounded-lg text-sm transition-all',
                      disabled
                        ? 'text-text-faint/40 cursor-not-allowed'
                        : inMonth
                          ? 'text-text hover:bg-bg-hover'
                          : 'text-text-faint hover:bg-bg-hover',
                      isSelected
                        ? 'bg-accent-500 text-white hover:bg-accent-500 shadow-[0_0_20px_var(--color-accent-glow)]'
                        : '',
                    ].join(' ')}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-border text-xs text-text-faint">
              Drag to select multiple days · {selected.size} selected
            </div>
          </div>

          {/* Form */}
          <div className="bg-bg-elevated/50 backdrop-blur border border-border rounded-2xl p-6 flex flex-col gap-5">
            <div>
              <label className="text-xs text-text-dim mb-2 block uppercase tracking-wide">
                Event name
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Team sync, coffee w/ Alex…"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2.5 text-text placeholder-text-faint focus:border-accent-500 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="text-xs text-text-dim mb-2 block uppercase tracking-wide">
                Time range
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={startHour}
                  onChange={(e) => setStartHour(Number(e.target.value))}
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-text focus:border-accent-500 focus:outline-none"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {formatHour(h)}
                    </option>
                  ))}
                </select>
                <span className="text-text-faint text-sm">to</span>
                <select
                  value={endHour}
                  onChange={(e) => setEndHour(Number(e.target.value))}
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-2.5 text-text focus:border-accent-500 focus:outline-none"
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h + 1} value={h + 1}>
                      {formatHour((h + 1) % 24)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={!canSubmit || submitting}
              onClick={handleCreate}
              className={[
                'mt-auto relative overflow-hidden rounded-lg py-3 font-medium transition',
                canSubmit && !submitting
                  ? 'bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-[0_8px_24px_-8px_var(--color-accent-glow)] hover:shadow-[0_12px_32px_-8px_var(--color-accent-glow)]'
                  : 'bg-bg border border-border text-text-faint cursor-not-allowed',
              ].join(' ')}
            >
              <AnimatePresence mode="wait">
                {submitting ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    Creating…
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    Create event →
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            {error && <div className="text-sm text-red-400">{error}</div>}
          </div>
        </div>

        <RotatingQuote />
      </motion.div>
    </div>
  )
}

function RotatingQuote() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * QUOTES.length))

  useEffect(() => {
    const tick = () => setIdx((i) => (i + 1) % QUOTES.length)
    const id = window.setInterval(tick, 7000)
    return () => window.clearInterval(id)
  }, [])

  const q = QUOTES[idx]

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4, duration: 0.6 }}
      className="mt-16 text-center text-xs text-text-faint min-h-[70px]"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="italic max-w-lg mx-auto leading-relaxed">
            &ldquo;{q.text}&rdquo;
          </p>
          <p className="mt-2 not-italic tracking-wide">
            — {q.author}, <span className="italic">{q.source}</span>
          </p>
        </motion.div>
      </AnimatePresence>
    </motion.footer>
  )
}

