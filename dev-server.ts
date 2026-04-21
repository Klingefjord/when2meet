// Tiny local dev server that dispatches /api/* requests to the Vercel-style
// handler files in ./api. No Express dependency — native http only.
import http from 'node:http'
import { URL } from 'node:url'
import 'dotenv/config'

const PORT = 3001

type Handler = (req: any, res: any) => Promise<void> | void

async function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve({})
      }
    })
  })
}

function wrapRes(res: http.ServerResponse) {
  const anyRes = res as any
  anyRes.status = (code: number) => {
    res.statusCode = code
    return anyRes
  }
  anyRes.json = (body: unknown) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
    return anyRes
  }
  return anyRes
}

async function resolveHandler(pathname: string): Promise<{ handler: Handler; params: Record<string, string> } | null> {
  // Strip /api prefix
  const rel = pathname.replace(/^\/api\/?/, '')
  const segments = rel.split('/').filter(Boolean)

  // Try static file: api/events.ts
  if (segments.length === 1) {
    try {
      const mod = await import(`./api/${segments[0]}.ts?t=${Date.now()}`)
      return { handler: mod.default, params: {} }
    } catch {}
  }

  // Try dynamic: api/events/[id].ts  -> segments[0]=events segments[1]=<id>
  if (segments.length === 2) {
    try {
      const mod = await import(`./api/${segments[0]}/[id].ts?t=${Date.now()}`)
      return { handler: mod.default, params: { id: segments[1] } }
    } catch {}
  }

  return null
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`)
    if (!url.pathname.startsWith('/api')) {
      res.statusCode = 404
      res.end('Not found')
      return
    }

    const match = await resolveHandler(url.pathname)
    if (!match) {
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'API route not found' }))
      return
    }

    const body = req.method !== 'GET' ? await parseBody(req) : {}
    const query: Record<string, string> = { ...match.params }
    url.searchParams.forEach((v, k) => (query[k] = v))

    const mockReq = { ...req, method: req.method, body, query, headers: req.headers }
    const mockRes = wrapRes(res)

    await match.handler(mockReq, mockRes)
  } catch (err: any) {
    console.error('[dev-server] error:', err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err?.message ?? 'Internal error' }))
  }
})

server.listen(PORT, () => {
  console.log(`[dev-server] http://localhost:${PORT}/api/*`)
})
