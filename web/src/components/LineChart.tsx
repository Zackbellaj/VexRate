import { useState, type PointerEvent } from 'react';
import { fmtDate, fmtRate } from '../format';

interface Props {
  points: { asOf: string; value: number }[]; // oldest first
  height?: number;
  detailed?: boolean; // axes labels + hover tooltip
}

const W = 600;

export function LineChart({ points, height = 60, detailed = false }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div className="chart-empty" style={{ height }}>Not enough data yet</div>;

  const pad = detailed ? { t: 12, r: 12, b: 24, l: 12 } : { t: 4, r: 2, b: 4, l: 2 };
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) [min, max] = [min * 0.999, max * 1.001];

  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1)},${height - pad.b}L${x(0)},${height - pad.b}Z`;

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const h = hover !== null ? points[hover] : null;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        style={{ height }}
        onPointerMove={detailed ? onMove : undefined}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="Rate history chart"
      >
        <path d={area} className="chart-area" />
        <path d={line} className="chart-line" vectorEffect="non-scaling-stroke" />
        {h && hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} className="chart-cursor" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {detailed && (
        <>
          <div className="chart-axis">
            <span>{fmtDate(points[0].asOf)}</span>
            <span>
              low {fmtRate(Math.min(...values))} · high {fmtRate(Math.max(...values))}
            </span>
            <span>{fmtDate(points[points.length - 1].asOf)}</span>
          </div>
          {h && hover !== null && (
            <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
              <strong>{fmtRate(h.value)}</strong>
              <span>{fmtDate(h.asOf)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
