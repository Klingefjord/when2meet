import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatHour } from '../lib/slots'
import { api } from '../lib/api'
import { QUOTES } from '../lib/quotes'
import { Frame } from '../components/Frame'
import { BootIntro } from '../components/BootIntro'

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
  gridStart.setDate(gridStart.getDate() - first.getDay())
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

  const dragMode = useRef<'add' | 'remove' | null>(null)

  const cells = useMemo(() => buildCalendar(monthAnchor), [monthAnchor])
  const monthLabel = monthAnchor
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    .toUpperCase()

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
      className="min-h-screen px-6 py-12 flex items-center justify-center"
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <BootIntro />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-5xl"
      >
        {/* Top banner */}
        <div className="mb-8 font-mono text-[13px]">
          <div className="text-text-bright">
            <span className="opacity-60">╔═</span> WHEN.EXE <span className="opacity-60">══ schedule sync v1.0 ══╗</span>
          </div>
          <div className="text-text-dim mt-1">
            <span className="opacity-60">║</span> enter dates &amp; time range, share the link, collect replies.
            <span className="blink text-text ml-2">▊</span>
          </div>
          <div className="text-text-bright opacity-60 mt-1">
            ╚════════════════════════════════════╝
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_360px] gap-6">
          {/* Calendar */}
          <Frame
            title="DATE.MATRIX"
            right={
              <div className="text-[11px] text-text-faint">
                [{selected.size.toString().padStart(2, '0')}] SEL
              </div>
            }
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() =>
                    setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                  }
                  className="px-2 py-1 text-text-dim hover:text-text border border-transparent hover:border-[#ffb000]/30 transition-colors"
                  aria-label="Previous month"
                >
                  &lt;&lt;
                </button>
                <div className="text-text-bright text-sm tracking-[0.3em]">{monthLabel}</div>
                <button
                  onClick={() =>
                    setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                  }
                  className="px-2 py-1 text-text-dim hover:text-text border border-transparent hover:border-[#ffb000]/30 transition-colors"
                  aria-label="Next month"
                >
                  &gt;&gt;
                </button>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((d, i) => (
                  <div
                    key={i}
                    className="text-center text-[10px] text-text-faint py-1 tracking-widest"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 no-select border-t border-l border-[#ffb000]/15">
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
                        'relative aspect-square text-sm transition-colors border-r border-b border-[#ffb000]/15 font-mono',
                        isSelected
                          ? 'bg-[#ffb000] !text-[#0a0806] hover:bg-[#ffd166] [text-shadow:none]'
                          : disabled
                            ? 'text-text-faint/40 cursor-not-allowed'
                            : inMonth
                              ? 'text-text hover:bg-[#ffb000]/10'
                              : 'text-text-faint hover:bg-[#ffb000]/10',
                      ].join(' ')}
                    >
                      {String(d.getDate()).padStart(2, '0')}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 text-[11px] text-text-faint">
                &gt; drag to select range
              </div>
            </div>
          </Frame>

          {/* Config */}
          <div className="flex flex-col gap-4">
            <Frame title="CONFIG">
              <div className="p-4 flex flex-col gap-4">
                <div>
                  <label className="text-[10px] text-text-dim mb-2 block tracking-[0.25em]">
                    EVENT.NAME
                  </label>
                  <div className="flex items-center border border-[#ffb000]/30 bg-[#0a0806] focus-within:border-[#ffb000]">
                    <span className="text-text-dim px-2 select-none">&gt;</span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="team_sync"
                      className="w-full bg-transparent py-2 pr-3 text-text placeholder-text-faint focus:outline-none text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-text-dim mb-2 block tracking-[0.25em]">
                    TIME.RANGE
                  </label>
                  <div className="flex items-center gap-2 text-sm">
                    <select
                      value={startHour}
                      onChange={(e) => setStartHour(Number(e.target.value))}
                      className="flex-1 bg-[#0a0806] border border-[#ffb000]/30 px-2 py-2 text-text focus:border-[#ffb000] focus:outline-none"
                    >
                      {Array.from({ length: 24 }).map((_, h) => (
                        <option key={h} value={h} className="bg-[#0a0806]">
                          {formatHour(h)}
                        </option>
                      ))}
                    </select>
                    <span className="text-text-faint">→</span>
                    <select
                      value={endHour}
                      onChange={(e) => setEndHour(Number(e.target.value))}
                      className="flex-1 bg-[#0a0806] border border-[#ffb000]/30 px-2 py-2 text-text focus:border-[#ffb000] focus:outline-none"
                    >
                      {Array.from({ length: 24 }).map((_, h) => (
                        <option key={h + 1} value={h + 1} className="bg-[#0a0806]">
                          {formatHour((h + 1) % 24)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </Frame>

            <motion.button
              whileTap={{ scale: 0.98 }}
              disabled={!canSubmit || submitting}
              onClick={handleCreate}
              className={[
                'group relative py-3 px-4 border font-mono tracking-[0.2em] text-sm transition-colors',
                canSubmit && !submitting
                  ? 'border-[#ffb000] text-[#ffb000] hover:bg-[#ffb000] hover:text-[#0a0806]'
                  : 'border-[#443826] text-text-faint cursor-not-allowed',
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
                    [ TRANSMITTING<span className="blink">_</span> ]
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    [ CREATE EVENT ]
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>

            {error && (
              <div className="text-sm text-[#ff3b30] border border-[#ff3b30]/50 px-3 py-2">
                ERR: {error}
              </div>
            )}
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
    const id = window.setInterval(() => setIdx((i) => (i + 1) % QUOTES.length), 8000)
    return () => window.clearInterval(id)
  }, [])

  const q = QUOTES[idx]

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.6 }}
      className="mt-16 text-[11px] text-text-faint min-h-[70px] font-mono"
    >
      <div className="text-text-dim opacity-60 mb-2">// daily.stdout</div>
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.5 }}
        >
          <p className="max-w-xl leading-relaxed">
            <span className="text-text-dim mr-2">&gt;</span>
            {q.text}
          </p>
          <p className="mt-1 text-text-faint">
            <span className="mr-2 opacity-50">  </span>— {q.author}, {q.source}
          </p>
        </motion.div>
      </AnimatePresence>
    </motion.footer>
  )
}
