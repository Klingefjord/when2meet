# when2meet-cool

A faster, prettier when2meet. Dark-mode first, drag-to-paint grid, live heatmap.

## Stack

- Vite + React + TypeScript
- Tailwind v4 (CSS-first, dark-mode)
- Framer Motion
- Neon Postgres + Prisma
- Vercel serverless (`/api/*`) — runs locally via a tiny native dev server

## Setup

1. **Create a Neon project** → https://neon.tech → copy the pooled connection string.

2. **Env file:**

   ```bash
   cp .env.example .env
   # paste DATABASE_URL into .env
   ```

3. **Install + push schema:**

   ```bash
   npm install
   npm run db:generate
   npm run db:push
   ```

4. **Run dev (Vite + API server together):**

   ```bash
   npm run dev
   ```

   - Vite:  http://localhost:5173
   - API:   http://localhost:3001 (proxied from Vite)

## Deploy (Vercel)

1. `vercel link`
2. Add `DATABASE_URL` env var.
3. `vercel --prod`

Vercel auto-detects `/api/*.ts` as serverless functions — no config needed.

## Routes

- `/#/` — landing (create event)
- `/#/e/:id` — event page (claim a name, drag-paint your availability)

## Layout

```
api/              serverless functions (Vercel-compatible)
  events.ts       POST — create event
  events/[id].ts  GET event, POST response
  _db.ts          shared Prisma client
dev-server.ts     native http server that dispatches /api/* to above
prisma/schema.prisma
src/
  pages/Landing.tsx
  pages/Event.tsx
  components/AvailabilityGrid.tsx
  lib/{api,slots,types}.ts
```
