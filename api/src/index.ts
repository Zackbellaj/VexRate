import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { timingSafeEqual } from 'hono/utils/buffer';
import { fetchVisaRate, VisaError } from './visa';
import { syncAll, syncPair, type Pair } from './sync';

type Env = {
  DB: D1Database;
  ADMIN_TOKEN: string;
  ALLOWED_ORIGINS: string; // comma-separated
};

const BACKFILL_DAYS = 30;
const CCY = /^[A-Z]{3}$/;

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.use('*', (c, next) =>
  cors({
    origin: (origin) => {
      const allowed = c.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
      return allowed.includes('*') || allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'DELETE'],
    allowHeaders: ['Authorization', 'Content-Type'],
  })(c, next),
);

const requireAdmin = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const token = c.env.ADMIN_TOKEN;
  if (!token) return c.json({ error: 'ADMIN_TOKEN is not configured' }, 500);
  const header = c.req.header('Authorization') ?? '';
  if (!header.startsWith('Bearer ') || !(await timingSafeEqual(header.slice(7), token))) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

function parsePair(from?: string, to?: string) {
  const f = from?.trim().toUpperCase() ?? '';
  const t = to?.trim().toUpperCase() ?? '';
  if (!CCY.test(f) || !CCY.test(t) || f === t) return null;
  return { from: f, to: t };
}

app.get('/health', (c) => c.json({ ok: true }));

/** Dashboard: every pair with its latest rate, the previous one, and the last 30 points. */
app.get('/pairs', async (c) => {
  const db = c.env.DB;
  const [pairs, recent] = await db.batch([
    db.prepare('SELECT id, from_ccy, to_ccy FROM pairs ORDER BY from_ccy, to_ccy'),
    db.prepare(
      `SELECT pair_id, as_of, visa_rate FROM rates
       WHERE as_of >= date('now', '-30 days') ORDER BY as_of`,
    ),
  ]);

  const byPair = new Map<number, { asOf: string; rate: number }[]>();
  for (const r of recent.results as { pair_id: number; as_of: string; visa_rate: number }[]) {
    const list = byPair.get(r.pair_id) ?? [];
    list.push({ asOf: r.as_of, rate: r.visa_rate });
    byPair.set(r.pair_id, list);
  }

  return c.json(
    (pairs.results as Pair[]).map((p) => {
      const series = byPair.get(p.id) ?? [];
      return {
        from: p.from_ccy,
        to: p.to_ccy,
        latest: series.at(-1) ?? null,
        previous: series.at(-2) ?? null,
        series,
      };
    }),
  );
});

app.get('/pairs/:from/:to/history', async (c) => {
  const pair = parsePair(c.req.param('from'), c.req.param('to'));
  if (!pair) return c.json({ error: 'Invalid currency codes' }, 400);
  const days = Math.min(Math.max(Number(c.req.query('days')) || 90, 1), 3650);

  const { results } = await c.env.DB.prepare(
    `SELECT r.as_of AS asOf, r.visa_rate AS rate FROM rates r
     JOIN pairs p ON p.id = r.pair_id
     WHERE p.from_ccy = ? AND p.to_ccy = ? AND r.as_of >= date('now', ?)
     ORDER BY r.as_of DESC`,
  )
    .bind(pair.from, pair.to, `-${days} days`)
    .all();
  return c.json(results);
});

app.post('/pairs', requireAdmin, async (c) => {
  const body = await c.req.json<{ from?: string; to?: string }>().catch(() => ({}) as { from?: string; to?: string });
  const pair = parsePair(body.from, body.to);
  if (!pair) return c.json({ error: 'Provide two different 3-letter currency codes' }, 400);

  // Validate the pair against Visa before saving it.
  let today;
  try {
    today = await fetchVisaRate(pair.from, pair.to, new Date());
  } catch (err) {
    if (err instanceof VisaError && err.kind === 'invalid_pair') return c.json({ error: err.message }, 422);
    return c.json({ error: `Visa is not responding right now (${(err as Error).message}), try again in a minute` }, 502);
  }

  const inserted = await c.env.DB.prepare(
    'INSERT INTO pairs (from_ccy, to_ccy) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING id, from_ccy, to_ccy',
  )
    .bind(pair.from, pair.to)
    .first<Pair>();
  if (!inserted) return c.json({ error: 'Pair already exists' }, 409);

  await c.env.DB.prepare('INSERT OR REPLACE INTO rates (pair_id, as_of, visa_rate) VALUES (?, ?, ?)')
    .bind(inserted.id, today.asOf, today.visaRate)
    .run();
  // Backfill history after responding.
  c.executionCtx.waitUntil(syncPair(c.env.DB, inserted, BACKFILL_DAYS, BACKFILL_DAYS));

  return c.json({ from: pair.from, to: pair.to, latest: { asOf: today.asOf, rate: today.visaRate } }, 201);
});

app.delete('/pairs/:from/:to', requireAdmin, async (c) => {
  const pair = parsePair(c.req.param('from'), c.req.param('to'));
  if (!pair) return c.json({ error: 'Invalid currency codes' }, 400);

  const db = c.env.DB;
  const [, deleted] = await db.batch([
    db.prepare(
      'DELETE FROM rates WHERE pair_id = (SELECT id FROM pairs WHERE from_ccy = ? AND to_ccy = ?)',
    ).bind(pair.from, pair.to),
    db.prepare('DELETE FROM pairs WHERE from_ccy = ? AND to_ccy = ?').bind(pair.from, pair.to),
  ]);
  if (!deleted.meta.changes) return c.json({ error: 'Pair not found' }, 404);
  return c.body(null, 204);
});

/** Manually trigger the daily sync (same as the cron). */
app.post('/sync', requireAdmin, async (c) => c.json(await syncAll(c.env.DB)));

/** Token check for the frontend's admin login. */
app.get('/auth', requireAdmin, (c) => c.json({ ok: true }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(syncAll(env.DB).then((r) => console.log('sync', JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
