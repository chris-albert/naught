import { useState } from 'react'
import { formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import type { MonthSummary } from '../model/reports'

const W = 900
const H = 140
const PAD = { top: 10, right: 12, bottom: 24, left: 56 }

/** Running total of monthly net over the range. Lumps from saving up then spending cancel out here. */
export function CumulativeLine({ summaries }: { summaries: MonthSummary[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const values = summaries.map((s) => s.cumulativeNet)
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = Math.max(1, hi - lo)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / summaries.length
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + innerH - ((v - lo) / span) * innerH
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const area = `${path} L${x(values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
  const last = values[values.length - 1]

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Cumulative net over the range">
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
        <text x={PAD.left - 8} y={y(0)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
          $0
        </text>
        <path d={area} className="series-net-area" />
        <path d={path} className="series-net-line" />
        {values.map((v, i) => (
          <g key={summaries[i].month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
            <circle cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} className="series-net-dot" />
          </g>
        ))}
        <text
          x={x(values.length - 1) - 8}
          y={Math.min(Math.max(y(last), PAD.top + 8), PAD.top + innerH - 4)}
          className="chart-label"
          textAnchor="end"
          dominantBaseline="middle"
        >
          {formatCents(last)}
        </text>
      </svg>
      <div className="chart-legend">
        <span>
          <i className="swatch series-net" /> Cumulative net
        </span>
        {hover !== null && (
          <span className="chart-tooltip">
            <strong>{formatMonth(summaries[hover].month)}</strong> · month net{' '}
            <span className={summaries[hover].net < 0 ? 'neg' : 'pos'}>{formatCents(summaries[hover].net)}</span> · running total{' '}
            <span className={values[hover] < 0 ? 'neg' : 'pos'}>{formatCents(values[hover])}</span>
          </span>
        )}
      </div>
    </div>
  )
}
