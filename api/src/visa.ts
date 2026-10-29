const VISA_URL = 'https://ma.visamiddleeast.com/cmsapi/fx/rates';

// Visa's site sits behind a bot challenge that rejects non-browser user agents.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.visamiddleeast.com/',
};

export class VisaError extends Error {
  constructor(
    message: string,
    readonly kind: 'invalid_pair' | 'blocked' | 'upstream',
  ) {
    super(message);
  }
}

export interface VisaRate {
  asOf: string; // YYYY-MM-DD
  visaRate: number; // 1 `to` = visaRate `from`
}

/** MM/DD/YYYY in UTC, the format Visa expects. */
function visaDate(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

const RETRY_DELAYS_MS = [1_000, 3_000];

/** Fetch one day's rate, retrying the transient refusals (406s, challenges) Visa sometimes returns. */
export async function fetchVisaRate(from: string, to: string, date: Date): Promise<VisaRate> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOnce(from, to, date);
    } catch (err) {
      const retryable = !(err instanceof VisaError && err.kind === 'invalid_pair');
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

async function fetchOnce(from: string, to: string, date: Date): Promise<VisaRate> {
  const day = visaDate(date);
  const params = new URLSearchParams({
    amount: '1',
    fee: '0',
    utcConvertedDate: day,
    exchangedate: day,
    fromCurr: from,
    toCurr: to,
  });

  const res = await fetch(`${VISA_URL}?${params}`, { headers: HEADERS });
  const body = await res.text();

  if (body.includes('Just a moment')) {
    throw new VisaError('Request blocked by Visa bot protection', 'blocked');
  }
  // Unknown currency codes come back as a bare 500 "Error".
  if (res.status === 500 && body.trim() === 'Error') {
    throw new VisaError(`Visa does not support ${from}/${to}`, 'invalid_pair');
  }
  if (!res.ok) {
    throw new VisaError(`Visa responded ${res.status}`, 'upstream');
  }

  let data: { status?: string; originalValues?: { asOfDate?: number; fxRateVisa?: string } };
  try {
    data = JSON.parse(body);
  } catch {
    throw new VisaError('Visa returned a non-JSON response', 'upstream');
  }

  const asOfDate = data.originalValues?.asOfDate;
  const visaRate = Number(data.originalValues?.fxRateVisa);
  if (data.status !== 'success' || !asOfDate || !Number.isFinite(visaRate) || visaRate <= 0) {
    throw new VisaError('Unexpected Visa response shape', 'upstream');
  }

  return {
    asOf: new Date(asOfDate * 1000).toISOString().slice(0, 10),
    visaRate,
  };
}
