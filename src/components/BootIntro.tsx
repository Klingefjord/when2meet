import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const LINES = [
  'WHEN.EXE v1.0 — (c) 2026 klingefjord systems',
  'initializing schedule matrix .......... ok',
  'loading timezone db ................... ok',
  'calibrating phosphor ................... ok',
  'READY.',
]

const LS_KEY = 'w2mc:boot-seen'

export function BootIntro() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(LS_KEY))
  const [lineIdx, setLineIdx] = useState(0)

  useEffect(() => {
    if (!visible) return
    // Show all lines quickly, then hide.
    let idx = 0
    const step = () => {
      idx++
      if (idx <= LINES.length) {
        setLineIdx(idx)
        setTimeout(step, 140)
      } else {
        setTimeout(() => {
          localStorage.setItem(LS_KEY, '1')
          setVisible(false)
        }, 420)
      }
    }
    const t = setTimeout(step, 140)
    setLineIdx(1)
    return () => clearTimeout(t)
  }, [visible])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[10000] bg-[#0a0806] flex items-center justify-center"
          onClick={() => {
            localStorage.setItem(LS_KEY, '1')
            setVisible(false)
          }}
        >
          <div className="font-mono text-[13px] text-[#ffb000] max-w-xl w-full px-8">
            {LINES.slice(0, lineIdx).map((line, i) => (
              <div key={i} className="whitespace-pre leading-6">
                <span className="opacity-60 mr-2">&gt;</span>
                {line}
              </div>
            ))}
            {lineIdx <= LINES.length && (
              <span className="inline-block w-2 h-4 bg-[#ffb000] blink align-middle mt-1" />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
