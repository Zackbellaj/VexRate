import { fetchVisaRate, VisaError, type VisaRate } from './visa';

export interface Pair {
  id: number;
  from_ccy: string;
  to_ccy: string;
}

// Free Workers allow 50 subrequests per invocation; keep headroom for D1.
const FETCH_BUDGET = 40;
const DAY_MS = 86_400_000;

function utcDay(offsetDays: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0); // midday avoids any DST/rounding edge
  return new Date(d.getTime() - offsetDays * DAY_MS);
}

async function upsertRates(db: D1Database, pairId: number, rates: VisaRate[]) {
  if (rates.length === 0) return;
  const stmt = db.prepare(
    `INSERT INTO rates (pair_id, as_of, visa_rate) VALUES (?, ?, ?)
     ON CONFLICT (pair_id, as_of) DO UPDATE SET
       visa_rate = excluded.visa_rate,
       fetched_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
  );
  await db.batch(rates.map((r) => stmt.bind(pairId, r.asOf, r.visaRate)));
}

/**
 * Fetch every day in the last `days` (today included) that the pair has no rate for yet,
 * up to `budget` Visa calls. Returns how many calls were spent.
 */
export async function syncPair(db: D1Database, pair: Pair, days: number, budget: number) {
  const since = utcDay(days - 1).toISOString().slice(0, 10);
  const { results } = await db
    .prepare('SELECT as_of FROM rates WHERE pair_id = ? AND as_of >= ?')
    .bind(pair.id, since)
    .all<{ as_of: string }>();
  const have = new Set(results.map((r) => r.as_of));

  const missing: Date[] = [];
  for (let i = 0; i < days && missing.length < budget; i++) {
    const day = utcDay(i);
    if (!have.has(day.toISOString().slice(0, 10))) missing.push(day);
  }

  const settled = await Promise.allSettled(
    missing.map((day) => fetchVisaRate(pair.from_ccy, pair.to_ccy, day)),
  );
  const ok: VisaRate[] = [];
  const errors: string[] = [];
  for (const s of settled) {
    if (s.status === 'fulfilled') ok.push(s.value);
    else errors.push(s.reason instanceof VisaError ? s.reason.message : String(s.reason));
  }

  await upsertRates(db, pair.id, ok);
  return { spent: missing.length, stored: ok.length, errors };
}

/** Daily job: fill today plus any gaps from the past week, for every pair. */
export async function syncAll(db: D1Database) {
  const { results: pairs } = await db
    .prepare('SELECT id, from_ccy, to_ccy FROM pairs ORDER BY id')
    .all<Pair>();

  let budget = FETCH_BUDGET;
  const report: Record<string, unknown> = {};
  for (const pair of pairs) {
    if (budget <= 0) {
      report[`${pair.from_ccy}-${pair.to_ccy}`] = 'skipped: subrequest budget exhausted';
      continue;
    }
    const r = await syncPair(db, pair, 7, budget);
    budget -= r.spent;
    report[`${pair.from_ccy}-${pair.to_ccy}`] = r;
  }
  return report;
}
