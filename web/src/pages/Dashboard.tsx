import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PairSummary } from '../api';
import { LineChart } from '../components/LineChart';
import { fmtDate, fmtRate, pctChange } from '../format';

export function Dashboard() {
  const [pairs, setPairs] = useState<PairSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.pairs().then(setPairs, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="alert error">Could not load rates: {error}</p>;
  if (!pairs) return <div className="grid">{[0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}</div>;
  if (pairs.length === 0)
    return (
      <div className="empty">
        <p>No currency pairs tracked yet.</p>
        <Link className="button" to="/manage">Add a pair</Link>
      </div>
    );

  return (
    <div className="grid">
      {pairs.map((p) => (
        <PairCard key={`${p.from}-${p.to}`} pair={p} />
      ))}
    </div>
  );
}

function PairCard({ pair }: { pair: PairSummary }) {
  const { from, to, latest, previous, series } = pair;
  const change = latest && previous ? pctChange(latest.rate, previous.rate) : null;

  return (
    <Link to={`/history/${from}/${to}`} className="card pair-card">
      <div className="pair-head">
        <h2>
          {from} <span className="arrow">→</span> {to}
        </h2>
        {change !== null && (
          <span className={`change ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>
            {change > 0 ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        )}
      </div>
      {latest ? (
        <>
          <p className="rate-main">
            1 {to} = <strong>{fmtRate(latest.rate)}</strong> {from}
          </p>
          <p className="rate-sub">
            1 {from} = {fmtRate(1 / latest.rate)} {to}
          </p>
          <LineChart points={series.map((s) => ({ asOf: s.asOf, value: s.rate }))} />
          <p className="muted small">Visa rate as of {fmtDate(latest.asOf)}</p>
        </>
      ) : (
        <p className="muted">No rate fetched yet</p>
      )}
    </Link>
  );
}
