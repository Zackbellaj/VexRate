const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api';
const TOKEN_KEY = 'vexrate-admin-token';

export interface Point {
  asOf: string; // YYYY-MM-DD
  rate: number; // 1 `to` = rate `from`
}

export interface PairSummary {
  from: string;
  to: string;
  latest: Point | null;
  previous: Point | null;
  series: Point[];
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const adminToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (auth) headers.set('Authorization', `Bearer ${adminToken.get() ?? ''}`);

  const res = await fetch(API_URL + path, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  pairs: () => request<PairSummary[]>('/pairs'),
  history: (from: string, to: string, days: number) =>
    request<Point[]>(`/pairs/${from}/${to}/history?days=${days}`),
  addPair: (from: string, to: string) =>
    request<PairSummary>('/pairs', { method: 'POST', body: JSON.stringify({ from, to }) }, true),
  deletePair: (from: string, to: string) =>
    request<void>(`/pairs/${from}/${to}`, { method: 'DELETE' }, true),
  sync: () => request<Record<string, unknown>>('/sync', { method: 'POST' }, true),
  checkToken: (token: string) =>
    request<{ ok: true }>('/auth', { headers: { Authorization: `Bearer ${token}` } }),
};
