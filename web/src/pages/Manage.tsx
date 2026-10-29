import { useEffect, useState, type FormEvent } from 'react';
import { adminToken, api, ApiError, type PairSummary } from '../api';
import { fmtDate } from '../format';

export function Manage() {
  const [authed, setAuthed] = useState(() => !!adminToken.get());
  return authed ? (
    <PairManager
      onLogout={() => {
        adminToken.clear();
        setAuthed(false);
      }}
    />
  ) : (
    <Login onLogin={() => setAuthed(true)} />
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.checkToken(token);
      adminToken.set(token);
      onLogin();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Wrong admin token' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h1>Admin</h1>
      <p className="muted">Enter the admin token to manage tracked currency pairs.</p>
      <input type="password" placeholder="Admin token" value={token} onChange={(e) => setToken(e.target.value)} autoFocus />
      <button disabled={busy || !token}>{busy ? 'Checking…' : 'Unlock'}</button>
      {error && <p className="alert error">{error}</p>}
    </form>
  );
}

function PairManager({ onLogout }: { onLogout: () => void }) {
  const [pairs, setPairs] = useState<PairSummary[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const load = () => api.pairs().then(setPairs, (e: Error) => setMsg({ kind: 'error', text: e.message }));
  useEffect(() => {
    load();
  }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMsg(null);
    try {
      await action();
      setMsg({ kind: 'success', text: success });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onLogout();
      setMsg({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const [f, t] = [from.trim().toUpperCase(), to.trim().toUpperCase()];
    run(async () => {
      await api.addPair(f, t);
      setFrom('');
      setTo('');
    }, `Added ${f} → ${t}. The last 30 days are being backfilled.`);
  }

  return (
    <section>
      <div className="history-head">
        <h1>Currency pairs</h1>
        <button className="ghost" onClick={onLogout}>Log out</button>
      </div>

      <form className="card add-form" onSubmit={add}>
        <label>
          Card currency
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="MAD" maxLength={3} required />
        </label>
        <span className="arrow">→</span>
        <label>
          Spending currency
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="EUR" maxLength={3} required />
        </label>
        <button disabled={busy}>{busy ? 'Working…' : 'Add pair'}</button>
      </form>

      {msg && <p className={`alert ${msg.kind}`}>{msg.text}</p>}

      <div className="card table-card">
        <table>
          <tbody>
            {pairs.map((p) => (
              <tr key={`${p.from}-${p.to}`}>
                <td>
                  <strong>{p.from}</strong> <span className="arrow">→</span> <strong>{p.to}</strong>
                </td>
                <td className="muted">{p.latest ? `Latest: ${fmtDate(p.latest.asOf)}` : 'No data yet'}</td>
                <td className="num">
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() =>
                      confirm(`Delete ${p.from} → ${p.to} and all its history?`) &&
                      run(() => api.deletePair(p.from, p.to), `Deleted ${p.from} → ${p.to}`)
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {pairs.length === 0 && (
              <tr>
                <td className="muted">No pairs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button className="ghost" disabled={busy} onClick={() => run(api.sync, 'Sync finished')}>
        Run daily sync now
      </button>
    </section>
  );
}
