import { useState } from 'react'
import type { BalancePoint } from '../model/accountBalances'
import { formatCents } from '../model/money'
import { ChartTooltip, TipRow } from './ChartTooltip'
import { compact, niceTicks } from './MonthlyBars'

const W = 900
const H = 240
const PAD = { top: 12, right: 12, bottom: 28, left: 64 }

/** One account's end-of-day balance as a line, with the area to the baseline fading out on either side of zero. */
export function BalanceLine({ points }: { points: BalancePoint[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const values = points.map((p) => p.balance)
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = Math.max(1, hi - lo)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / Math.max(1, points.length)
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + innerH - ((v - lo) / span) * innerH
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const area = values.length ? `${path} L${x(values.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : ''
  const last = values.length - 1
  const zeroOffset = (y(0) - PAD.top) / innerH
  // niceTicks needs a positive max; the baseline is drawn on its own
  const ticks = [...(lo < 0 ? niceTicks(-lo, 3).map((t) => -t) : []), 0, ...(hi > 0 ? niceTicks(hi, 4) : [])]
  const signed = (v: number) => (v < 0 ? `-${compact(-v)}` : compact(v))
  // up to about three months, label every week; past that, the first of each month
  const labelled = (i: number) => (points.length <= 92 ? i % 7 === 0 : points[i].date.endsWith('-01'))

  return (
    <div className="chart">
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Balance by day">
          <defs>
            <linearGradient id="grad-balance-area" className="grad-net-area" gradientUnits="userSpaceOnUse" x1="0" y1={PAD.top} x2="0" y2={PAD.top + innerH}>
              <stop offset="0" />
              <stop offset={zeroOffset} />
              <stop offset="1" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              {t !== 0 && <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />}
              <text x={PAD.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                {signed(t)}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
          {values.length > 0 && <path d={area} fill="url(#grad-balance-area)" />}
          <path d={path} className="series-net-halo" />
          <path d={path} className="series-net-line" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="chart-crosshair" />}
          {points.map((p, i) => (
            <g key={p.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
              {(hover === i || (hover === null && i === last)) && <circle cx={x(i)} cy={y(values[i])} r={5} className="series-net-dot" />}
              {labelled(i) && (
                <text x={x(i)} y={H - 8} className={`chart-axis ${hover === i ? 'active' : ''}`} textAnchor="middle">
                  {axisDay(p.date)}
                </text>
              )}
            </g>
          ))}
          {hover === null && values.length > 0 && (
            <text
              x={x(last) - 10}
              y={Math.min(Math.max(y(values[last]) - 10, PAD.top + 8), PAD.top + innerH - 4)}
              className="chart-label"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatCents(values[last])}
            </text>
          )}
        </svg>
        {hover !== null && (
          <ChartTooltip x={x(hover)} y={y(values[hover])} w={W} h={H}>
            <strong>{longDay(points[hover].date)}</strong>
            <TipRow swatch="series-net" label="Balance" value={<span className={values[hover] < 0 ? 'neg' : ''}>{formatCents(values[hover])}</span>} />
            {hover > 0 && <TipRow label="Change" value={<Signed value={values[hover] - values[hover - 1]} />} />}
          </ChartTooltip>
        )}
      </div>
    </div>
  )
}

function Signed({ value }: { value: number }) {
  if (value === 0) return <span className="muted">–</span>
  return <span className={value < 0 ? 'neg' : 'pos'}>{value > 0 ? '+' : ''}{formatCents(value)}</span>
}

/** "Oct 3", or "Jan 2027" on a new year's first label. */
function axisDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (date.endsWith('-01-01')) return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function longDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
