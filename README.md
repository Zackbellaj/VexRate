# Visa Exchange Rates

Tracks daily Visa card FX rates for chosen currency pairs, with history and charts.

| Part  | Stack                                   | Hosting (free)              |
|-------|-----------------------------------------|-----------------------------|
| `api` | Cloudflare Worker (Hono) + D1 (SQLite)  | Cloudflare Workers free plan |
| `web` | Vite + React + TypeScript               | Vercel Hobby                |

The Worker fetches rates on a cron (01:15 and 13:15 UTC), fills any gaps from the past week,
and backfills 30 days when a pair is added. Adding/deleting pairs requires an admin token.

**Rate semantics:** for pair `MAD → EUR` (card currency → spending currency), the stored
`visa_rate` is how much MAD 1 EUR costs (e.g. 11.0786). The UI also shows the inverse.

## Local development

```sh
# API  (http://localhost:8787)
cd api
npm install
cp .dev.vars.example .dev.vars        # set ADMIN_TOKEN
npm run db:migrate:local
npm run dev                          # add --test-scheduled, then GET /__scheduled to fire the cron

# Web  (http://localhost:5173)
cd web
npm install
cp .env.example .env.local           # VITE_API_URL=http://localhost:8787
npm run dev
```

## Deploy

### 1. API → Cloudflare
```sh
cd api
npx wrangler login
npx wrangler d1 create vexrate       # paste the printed database_id into wrangler.jsonc
npm run db:migrate                   # applies migrations to the remote D1
npx wrangler secret put ADMIN_TOKEN  # pick a long random string
npm run deploy                       # prints https://vexrate-api.<you>.workers.dev
```

### 2. Web → Vercel
Import the repo in Vercel and set:
- **Root Directory:** `web` (framework preset: Vite)
- **Environment variable:** `VITE_API_URL=https://vexrate-api.<you>.workers.dev`

### 3. Allow the frontend origin
Set `ALLOWED_ORIGINS` in `api/wrangler.jsonc` to your Vercel URL
(e.g. `"https://vexrate.vercel.app,http://localhost:5173"`) and `npm run deploy` again.

## API

| Method | Path                                   | Auth  |
|--------|----------------------------------------|-------|
| GET    | `/api/pairs` (dashboard: latest + 30d)  |       |
| GET    | `/api/pairs/:from/:to/history?days=90`  |       |
| POST   | `/api/pairs` `{ "from": "MAD", "to": "EUR" }` | Bearer |
| DELETE | `/api/pairs/:from/:to`                  | Bearer |
| POST   | `/api/sync` (run the cron job now)      | Bearer |

## Free-tier notes
- Workers free: 100k requests/day, 50 outbound fetches per invocation — the sync spends at most
  40 Visa calls per run, so many pairs or long gaps catch up over a few runs.
- Visa's site is behind bot protection; the Worker sends browser-like headers. If Cloudflare IPs ever
  get blocked, `/api/sync` will return `blocked` errors — tell me and we'll move the fetcher to a
  GitHub Actions cron.
