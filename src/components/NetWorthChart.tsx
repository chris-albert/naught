import { useState } from 'react'
import { formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import type { NetWorthMonth } from '../model/netWorth'
import { ChartTooltip, TipRow } from './ChartTooltip'
import { compact, niceTicks } from './MonthlyBars'

const W = 900
const H = 240
const PAD = { top: 12, right: 12, bottom: 28, left: 64 }

/** Net worth at the end of each month as a line, with the area to the baseline fading out on either side of zero. */
export function NetWorthChart({ summaries }: { summaries: NetWorthMonth[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const values = summaries.map((s) => s.net)
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = Math.max(1, hi - lo)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / Math.max(1, summaries.length)
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + innerH - ((v - lo) / span) * innerH
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const area = values.length ? `${path} L${x(values.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : ''
  const last = values.length - 1
  const zeroOffset = (y(0) - PAD.top) / innerH
  // niceTicks needs a positive max; the baseline is drawn on its own
  const ticks = [...(lo < 0 ? niceTicks(-lo, 3).map((t) => -t) : []), 0, ...(hi > 0 ? niceTicks(hi, 4) : [])]
  const signed = (v: number) => (v < 0 ? `-${compact(-v)}` : compact(v))
  // label every month when they fit, otherwise every nth
  const every = Math.ceil(summaries.length / 24)

  return (
    <div className="chart">
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Net worth by month">
          <defs>
            <linearGradient id="grad-net-worth-area" className="grad-net-area" gradientUnits="userSpaceOnUse" x1="0" y1={PAD.top} x2="0" y2={PAD.top + innerH}>
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
          {values.length > 0 && <path d={area} fill="url(#grad-net-worth-area)" />}
          <path d={path} className="series-net-halo" />
          <path d={path} className="series-net-line" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="chart-crosshair" />}
          {summaries.map((s, i) => (
            <g key={s.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
              {(hover === i || (hover === null && i === last)) && <circle cx={x(i)} cy={y(values[i])} r={5} className="series-net-dot" />}
              {(i % every === 0 || i === last) && (
                <text x={x(i)} y={H - 8} className={`chart-axis ${hover === i ? 'active' : ''}`} textAnchor="middle">
                  {axisMonth(s.month)}
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
            <strong>{formatMonth(summaries[hover].month)}</strong>
            <TipRow label="Assets" value={formatCents(summaries[hover].assets)} />
            <TipRow label="Debts" value={summaries[hover].debts ? <span className="neg">{formatCents(summaries[hover].debts)}</span> : '–'} />
            <TipRow swatch="series-net" label="Net worth" value={<span className={values[hover] < 0 ? 'neg' : 'pos'}>{formatCents(values[hover])}</span>} />
            {hover > 0 && <TipRow label="Change" value={<Signed value={values[hover] - values[hover - 1]} />} />}
          </ChartTooltip>
        )}
      </div>
      <div className="chart-legend">
        <span>
          <i className="swatch series-net" /> Net worth
        </span>
      </div>
    </div>
  )
}

function Signed({ value }: { value: number }) {
  if (value === 0) return <span className="muted">–</span>
  return <span className={value < 0 ? 'neg' : 'pos'}>{value > 0 ? '+' : ''}{formatCents(value)}</span>
}

function axisMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return m === 1 ? `${label} ${y}` : label
}
