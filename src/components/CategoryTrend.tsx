import { useState } from 'react'
import { formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import type { CategoryReport } from '../model/reports'
import type { MonthKey } from '../model/types'

const W = 900
const H = 160
const PAD = { top: 12, right: 12, bottom: 28, left: 56 }

/** One category's net money out per month, with its average across the range as a dashed line. Net money in dips below the baseline. */
export function CategoryTrend({ report, months }: { report: CategoryReport; months: MonthKey[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const values = report.byMonth
  const hi = Math.max(1, report.average, ...values)
  const lo = Math.min(0, ...values)
  const span = hi - lo
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / values.length
  const barW = Math.min(28, band - 8)
  const y = (v: number) => PAD.top + innerH - ((v - lo) / span) * innerH
  const ticks = niceTicks(hi, 3)

  return (
    <div className="chart category-trend">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={`${report.category.name} by month`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {compact(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const cx = PAD.left + band * i + band / 2
          const active = hover === i
          return (
            <g key={months[i]} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
              <Bar x={cx - barW / 2} w={barW} value={v} y={y} dim={hover !== null && !active} />
              <text x={cx} y={H - 8} className="chart-axis" textAnchor="middle">
                {shortMonth(months[i])}
              </text>
            </g>
          )
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
        {report.average > 0 && (
          <>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(report.average)} y2={y(report.average)} className="chart-average" />
            <text x={W - PAD.right} y={y(report.average) - 5} className="chart-label" textAnchor="end">
              avg {formatCents(report.average)}
            </text>
          </>
        )}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="swatch series-spending" /> Spent
        </span>
        {values.some((v) => v < 0) && (
          <span>
            <i className="swatch series-income" /> Net money in
          </span>
        )}
        <span>
          <i className="swatch swatch-average" /> Average
        </span>
        {hover !== null && (
          <span className="chart-tooltip">
            <strong>{formatMonth(months[hover])}</strong> ·{' '}
            {values[hover] < 0 ? <span className="pos">+{formatCents(-values[hover])}</span> : formatCents(values[hover])} ·{' '}
            {formatCents(Math.abs(values[hover] - report.average))} {values[hover] < report.average ? 'below' : 'above'} average
          </span>
        )}
      </div>
    </div>
  )
}

function Bar({ x, w, value, y, dim }: { x: number; w: number; value: number; y: (v: number) => number; dim: boolean }) {
  if (value === 0) return null
  const out = value > 0
  const top = out ? y(value) : y(0)
  const bottom = out ? y(0) : y(value)
  const h = bottom - top
  const r = Math.min(4, h)
  // rounded at the data end, square at the baseline
  const d = out
    ? `M${x},${bottom} V${top + r} a${r},${r} 0 0 1 ${r},-${r} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${bottom} Z`
    : `M${x},${top} V${bottom - r} a${r},${r} 0 0 0 ${r},${r} h${w - 2 * r} a${r},${r} 0 0 0 ${r},-${r} V${top} Z`
  return <path d={d} className={`${out ? 'series-spending' : 'series-income'} ${dim ? 'dim' : ''}`} />
}

function niceTicks(max: number, count: number): number[] {
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const ticks: number[] = []
  for (let v = step; v <= max; v += step) ticks.push(v)
  return ticks
}

function compact(cents: number): string {
  const d = cents / 100
  return d >= 1000 ? `$${(d / 1000).toFixed(d % 1000 === 0 ? 0 : 1)}k` : `$${d}`
}

function shortMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return m === 1 ? `${label} ${y}` : label
}
