import type { ReactNode } from 'react'

type Props = {
  title?: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  variant?: 'amber' | 'green'
}

/**
 * Terminal-style box. Renders an ASCII-ish header with `┌─ TITLE ─┐` vibes
 * and a single-pixel bordered body. No rounded corners — this is a CRT.
 */
export function Frame({ title, subtitle, right, children, className, variant = 'amber' }: Props) {
  const borderColor = variant === 'green' ? 'border-[#00ff7a]/40' : 'border-[#ffb000]/30'
  return (
    <div className={['relative', className ?? ''].join(' ')}>
      {title && (
        <div className="flex items-center gap-2 mb-[-1px]">
          <div className={['text-[11px] uppercase tracking-[0.2em]', variant === 'green' ? 'text-[#00ff7a]' : 'text-text-dim'].join(' ')}>
            <span className="opacity-60">┌─</span>
            <span className="px-2">{title}</span>
            <span className="opacity-60">─</span>
          </div>
          {subtitle && (
            <div className="text-[11px] text-text-faint tracking-wider">
              {subtitle}
            </div>
          )}
          <div className="flex-1 h-px bg-current opacity-20" />
          {right && <div className="pl-2">{right}</div>}
        </div>
      )}
      <div className={['border bg-[#0a0806]/70 backdrop-blur-[1px]', borderColor].join(' ')}>
        {children}
      </div>
    </div>
  )
}
