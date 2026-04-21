import { useEffect, useState } from 'react'
import { Landing } from './pages/Landing'
import { Event } from './pages/Event'

function parseHash(): { route: 'home' } | { route: 'event'; id: string } {
  const h = window.location.hash.replace(/^#\/?/, '')
  const match = h.match(/^e\/([a-z0-9]+)/i)
  if (match) return { route: 'event', id: match[1] }
  return { route: 'home' }
}

export default function App() {
  const [loc, setLoc] = useState(parseHash)

  useEffect(() => {
    const onHash = () => setLoc(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (path: string) => {
    window.location.hash = path
  }

  if (loc.route === 'event') {
    return <Event eventId={loc.id} />
  }
  return <Landing onCreated={(id) => go(`/e/${id}`)} />
}
