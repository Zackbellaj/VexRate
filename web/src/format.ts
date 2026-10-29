/** Significant-digit formatting so both 11.0786 and 0.090264 read well. */
export function fmtRate(n: number): string {
  return n.toLocaleString('en-US', { maximumSignificantDigits: 6, minimumSignificantDigits: 4 });
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

export function pctChange(curr: number, prev: number): number {
  return ((curr - prev) / prev) * 100;
}
