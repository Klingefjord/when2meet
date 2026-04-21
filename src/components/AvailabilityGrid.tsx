import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LocalGrid } from '../lib/slots'

type SlotIso = string

type Props = {
  grid: LocalGrid
  mode: 'edit' | 'view'
  selected?: Set<SlotIso>
  onSelectedChange?: (next: Set<SlotIso>) => void
  heat?: Map<SlotIso, string[]>
  totalResponders?: number
  onHoverSlot?: (slot: SlotIso | null) => void
  // Inclusive column range [startCol, startCol + visibleCount) — when set,
  // only that slice of columns is rendered. Drag-paint still uses absolute
  // column indices so lockstep pagination across two grids works.
  columnWindow?: { start: number; count: number }
  // Row height in px — defaults to 22 (desktop). Use 36+ on touch devices.
  rowHeight?: number
  // Label column width — defaults to 60px.
  labelWidth?: number
  // When true, touch events paint rather than scroll. When false (default on
  // mobile), touch gestures pass through so the page scrolls; only single
  // taps toggle individual slots.
  touchPaint?: boolean
}

export function AvailabilityGrid({
  grid,
  mode,
  selected,
  onSelectedChange,
  heat,
  totalResponders = 0,
  onHoverSlot,
  columnWindow,
  rowHeight = 22,
  labelWidth = 60,
  touchPaint = true,
}: Props) {
  const visibleColumns = useMemo(() => {
    if (!columnWindow) return grid.columns.map((c, i) => ({ col: c, absIdx: i }))
    const end = Math.min(grid.columns.length, columnWindow.start + columnWindow.count)
    return grid.columns.slice(columnWindow.start, end).map((c, i) => ({
      col: c,
      absIdx: columnWindow.start + i,
    }))
  }, [grid.columns, columnWindow])
  const gridRef = useRef<HTMLDivElement>(null)

  // Drag-paint state
  const dragMode = useRef<'add' | 'remove' | null>(null)
  const dragStart = useRef<{ colIdx: number; rowIdx: number } | null>(null)
  const baseSelected = useRef<Set<SlotIso>>(new Set())
  const [dragOver, setDragOver] = useState<Set<SlotIso> | null>(null)

  const heatFor = useCallback((iso: SlotIso) => heat?.get(iso)?.length ?? 0, [heat])

  const cellAtPoint = (clientX: number, clientY: number): { colIdx: number; rowIdx: number; iso: string } | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    if (!el) return null
    const btn = el.closest('[data-cell]') as HTMLElement | null
    if (!btn) return null
    const colIdx = Number(btn.dataset.col)
    const rowIdx = Number(btn.dataset.row)
    const iso = btn.dataset.iso!
    return { colIdx, rowIdx, iso }
  }

  const rectBetween = (
    a: { colIdx: number; rowIdx: number },
    b: { colIdx: number; rowIdx: number },
  ): Set<SlotIso> => {
    const [c0, c1] = [Math.min(a.colIdx, b.colIdx), Math.max(a.colIdx, b.colIdx)]
    const [r0, r1] = [Math.min(a.rowIdx, b.rowIdx), Math.max(a.rowIdx, b.rowIdx)]
    const out = new Set<SlotIso>()
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const iso = grid.cell.get(`${grid.columns[c].key}|${r}`)
        if (iso) out.add(iso)
      }
    }
    return out
  }

  const beginDrag = (colIdx: number, rowIdx: number, iso: SlotIso) => {
    if (mode !== 'edit' || !selected || !onSelectedChange) return
    const isSelected = selected.has(iso)
    dragMode.current = isSelected ? 'remove' : 'add'
    dragStart.current = { colIdx, rowIdx }
    baseSelected.current = new Set(selected)
    const next = new Set(selected)
    if (isSelected) next.delete(iso)
    else next.add(iso)
    onSelectedChange(next)
    setDragOver(new Set([iso]))
  }

  const continueDrag = (colIdx: number, rowIdx: number) => {
    if (!dragMode.current || !dragStart.current || !selected || !onSelectedChange) return
    const rect = rectBetween(dragStart.current, { colIdx, rowIdx })
    const next = new Set(baseSelected.current)
    for (const k of rect) {
      if (dragMode.current === 'add') next.add(k)
      else next.delete(k)
    }
    onSelectedChange(next)
    setDragOver(rect)
  }

  const endDrag = () => {
    dragMode.current = null
    dragStart.current = null
    setDragOver(null)
  }

  // For touch gestures without paint mode: track the start point; if the user
  // lifts without moving more than a small threshold, treat it as a tap that
  // toggles the single slot. If they move further, it's a scroll — bail.
  const touchTap = useRef<{ iso: SlotIso; x: number; y: number; cancelled: boolean } | null>(null)

  const toggleSingleSlot = (iso: SlotIso) => {
    if (mode !== 'edit' || !selected || !onSelectedChange) return
    const next = new Set(selected)
    if (next.has(iso)) next.delete(iso)
    else next.add(iso)
    onSelectedChange(next)
  }

  const onPointerDown = (e: React.PointerEvent, colIdx: number, rowIdx: number, iso: SlotIso) => {
    if (mode !== 'edit') return

    // Mouse / stylus: always drag-paint.
    // Touch with paint mode on: drag-paint.
    // Touch with paint mode off: don't preventDefault — let the page scroll.
    //   Record a potential tap; commit it on pointerup if barely moved.
    const isTouch = e.pointerType === 'touch'
    if (isTouch && !touchPaint) {
      touchTap.current = { iso, x: e.clientX, y: e.clientY, cancelled: false }
      return
    }

    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    beginDrag(colIdx, rowIdx, iso)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    // Cancel a pending touch-tap if the finger moved more than a few px —
    // that means the user is trying to scroll, not tap.
    if (touchTap.current && !touchTap.current.cancelled) {
      const dx = e.clientX - touchTap.current.x
      const dy = e.clientY - touchTap.current.y
      if (dx * dx + dy * dy > 100) {
        // ~10px threshold
        touchTap.current.cancelled = true
      }
    }

    if (!dragMode.current) {
      if (onHoverSlot) {
        const c = cellAtPoint(e.clientX, e.clientY)
        onHoverSlot(c?.iso ?? null)
      }
      return
    }
    const c = cellAtPoint(e.clientX, e.clientY)
    if (c) continueDrag(c.colIdx, c.rowIdx)
  }

  // Complete a touch-tap if the finger lifted without scrolling.
  const onPointerUp = () => {
    if (touchTap.current && !touchTap.current.cancelled) {
      toggleSingleSlot(touchTap.current.iso)
    }
    touchTap.current = null
  }

  useEffect(() => {
    const up = () => {
      onPointerUp()
      endDrag()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    // onPointerUp reads touchTap + selected via closure; fine since the
    // effect runs on every render anyway due to no deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  const gridCols = `${labelWidth}px repeat(${visibleColumns.length}, minmax(36px, 1fr))`

  return (
    <div
      ref={gridRef}
      className={[
        'relative select-none no-select',
        // When paint mode is on, capture touch so drag paints (doesn't scroll).
        // When off, touch pans the page; we still catch taps via pointer events.
        touchPaint ? 'touch-none' : 'touch-pan-y',
      ].join(' ')}
      onPointerMove={onPointerMove}
      onPointerLeave={() => onHoverSlot?.(null)}
    >
      {/* Header */}
      <div
        className="grid sticky top-0 z-20 bg-bg/80 backdrop-blur"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div />
        {visibleColumns.map(({ col }) => (
          <div key={col.key} className="text-center py-2 border-b border-border">
            <div className="text-[10px] uppercase tracking-wider text-text-faint">{col.label.weekday}</div>
            <div className="text-base sm:text-lg font-medium leading-tight">{col.label.day}</div>
            <div className="text-[10px] text-text-faint">{col.label.month}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="grid" style={{ gridTemplateColumns: gridCols }}>
        {grid.rows.map((r, rIdx) => {
          const isHourRow = r.minute === 0
          return (
            <Fragment key={`r-${rIdx}`}>
              <div
                className={[
                  'relative text-[11px] text-text-faint pr-2 text-right',
                  isHourRow ? 'pt-[2px]' : '',
                ].join(' ')}
                style={{ height: rowHeight, lineHeight: `${rowHeight}px` }}
              >
                {r.label ?? ''}
              </div>

              {visibleColumns.map(({ col, absIdx }) => {
                const iso = grid.cell.get(`${col.key}|${rIdx}`)
                const exists = !!iso
                const isSelected = iso ? selected?.has(iso) ?? false : false
                const isHovered = iso ? dragOver?.has(iso) ?? false : false
                const count = iso ? heatFor(iso) : 0
                const intensity = totalResponders > 0 ? count / totalResponders : 0

                if (!exists) {
                  return (
                    <div
                      key={`${col.key}-${rIdx}`}
                      className={[
                        'border-l border-border bg-black/30',
                        isHourRow ? 'border-t border-border' : 'border-t border-border/40',
                      ].join(' ')}
                      style={{ height: rowHeight }}
                    />
                  )
                }

                return (
                  <button
                    key={iso}
                    type="button"
                    data-cell
                    data-col={absIdx}
                    data-row={rIdx}
                    data-iso={iso}
                    onPointerDown={(e) => onPointerDown(e, absIdx, rIdx, iso!)}
                    onMouseEnter={() => onHoverSlot?.(iso!)}
                    className={[
                      'relative border-l border-border',
                      isHourRow ? 'border-t border-border' : 'border-t border-border/40',
                      mode === 'edit' ? 'cursor-pointer' : 'cursor-default',
                    ].join(' ')}
                    style={{ height: rowHeight }}
                  >
                    {mode === 'view' && count > 0 && (
                      <div
                        className="absolute inset-0"
                        style={{ background: heatColor(intensity) }}
                      />
                    )}
                    {mode === 'edit' && isSelected && (
                      <div
                        className="absolute inset-0 bg-accent-500"
                        style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
                      />
                    )}
                    {isHovered && !isSelected && mode === 'edit' && (
                      <div className="absolute inset-0 bg-accent-500/30" />
                    )}
                  </button>
                )
              })}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function heatColor(intensity: number): string {
  if (intensity <= 0) return 'transparent'
  const alpha = Math.min(0.95, 0.15 + intensity * 0.85)
  const hue = 270 + intensity * 30
  const light = 45 + intensity * 20
  return `hsla(${hue}, 85%, ${light}%, ${alpha})`
}
