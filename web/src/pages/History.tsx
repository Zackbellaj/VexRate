import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Point } from '../api';
import { LineChart } from '../components/LineChart';
import { fmtDate, fmtRate, pctChange } from '../format';

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 3650 },
];

export function History() {
  const { from = '', to = '' } = useParams();
  const [days, setDays] = useState(90);
  const [inverted, setInverted] = useState(false);
  // Results are tagged with the request key so stale data never shows while a new range loads.
  const key = `${from}/${to}/${days}`;
  const [result, setResult] = useState<{ key: string; rows?: Point[]; error?: string } | null>(null);

  useEffect(() => {
    api.history(from, to, days).then(
      (rows) => setResult({ key, rows }),
      (e: Error) => setResult({ key, error: e.message }),
    );
  }, [from, to, days, key]);

  const current = result?.key === key ? result : null;
  const rows = current?.rows ?? null;
  const error = current?.error ?? null;

  // Default: 1 `to` = x `from` (what a `from` card pays). Inverted: 1 `from` = x `to`.
  const [base, quote] = inverted ? [from, to] : [to, from];
  const value = (r: Point) => (inverted ? 1 / r.rate : r.rate);
  const chronological = rows ? [...rows].reverse().map((r) => ({ asOf: r.asOf, value: value(r) })) : [];

  return (
    <section>
      <Link to="/" className="back">← Dashboard</Link>
      <div className="history-head">
        <h1>
          1 {base} <span className="arrow">in</span> {quote}
        </h1>
        <button className="ghost" onClick={() => setInverted((v) => !v)} title="Swap direction">
          ⇄ Swap
        </button>
      </div>

      <div className="segmented" role="group" aria-label="Range">
        {RANGES.map((r) => (
          <button key={r.days} className={r.days === days ? 'active' : ''} onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>

      {error && <p className="alert error">{error}</p>}
      {!rows && !error && <div className="card skeleton tall" />}
      {rows && rows.length === 0 && <p className="muted">No history for this pair.</p>}
      {rows && rows.length > 0 && (
        <>
          <div className="card">
            <LineChart points={chronological} height={260} detailed />
          </div>
          <div className="card table-card">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">1 {base} =</th>
                  <th className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const prev = rows[i + 1];
                  const change = prev ? pctChange(value(r), value(prev)) : null;
                  return (
                    <tr key={r.asOf}>
                      <td>{fmtDate(r.asOf, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</td>
                      <td className="num">
                        {fmtRate(value(r))} {quote}
                      </td>
                      <td className={`num change ${change && change > 0 ? 'up' : change && change < 0 ? 'down' : ''}`}>
                        {change === null ? '–' : `${change > 0 ? '+' : ''}${change.toFixed(2)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
