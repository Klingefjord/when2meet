import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
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
}

export function AvailabilityGrid({
  grid,
  mode,
  selected,
  onSelectedChange,
  heat,
  totalResponders = 0,
  onHoverSlot,
}: Props) {
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

  const onPointerDown = (e: React.PointerEvent, colIdx: number, rowIdx: number, iso: SlotIso) => {
    if (mode !== 'edit') return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    beginDrag(colIdx, rowIdx, iso)
  }

  const onPointerMove = (e: React.PointerEvent) => {
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

  useEffect(() => {
    const up = () => endDrag()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  const gridCols = `60px repeat(${grid.columns.length}, minmax(44px, 1fr))`

  return (
    <div
      ref={gridRef}
      className="relative select-none no-select"
      onPointerMove={onPointerMove}
      onPointerLeave={() => onHoverSlot?.(null)}
    >
      {/* Header */}
      <div
        className="grid sticky top-0 z-20 bg-bg/80 backdrop-blur"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div />
        {grid.columns.map((col) => (
          <div key={col.key} className="text-center py-3 border-b border-border">
            <div className="text-[10px] uppercase tracking-wider text-text-faint">{col.label.weekday}</div>
            <div className="text-lg font-medium">{col.label.day}</div>
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
                style={{ height: 22, lineHeight: '22px' }}
              >
                {r.label ?? ''}
              </div>

              {grid.columns.map((col, cIdx) => {
                const iso = grid.cell.get(`${col.key}|${rIdx}`)
                const exists = !!iso
                const isSelected = iso ? selected?.has(iso) ?? false : false
                const isHovered = iso ? dragOver?.has(iso) ?? false : false
                const count = iso ? heatFor(iso) : 0
                const intensity = totalResponders > 0 ? count / totalResponders : 0

                if (!exists) {
                  // Gap cell (e.g. when viewer's tz shifts this window's shape)
                  return (
                    <div
                      key={`${col.key}-${rIdx}`}
                      className={[
                        'border-l border-border bg-black/30',
                        isHourRow ? 'border-t border-border' : 'border-t border-border/40',
                      ].join(' ')}
                      style={{ height: 22 }}
                    />
                  )
                }

                return (
                  <button
                    key={iso}
                    type="button"
                    data-cell
                    data-col={cIdx}
                    data-row={rIdx}
                    data-iso={iso}
                    onPointerDown={(e) => onPointerDown(e, cIdx, rIdx, iso!)}
                    onMouseEnter={() => onHoverSlot?.(iso!)}
                    className={[
                      'relative border-l border-border',
                      isHourRow ? 'border-t border-border' : 'border-t border-border/40',
                      mode === 'edit' ? 'cursor-pointer' : 'cursor-default',
                    ].join(' ')}
                    style={{ height: 22 }}
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
