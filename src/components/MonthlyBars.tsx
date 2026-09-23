import { useState } from 'react'
import { formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import type { MonthSummary } from '../model/reports'

const W = 900
const H = 220
const PAD = { top: 12, right: 12, bottom: 28, left: 56 }

/** Paired columns per month: income and living spending, with money set aside stacked on top of living. One shared axis. */
export function MonthlyBars({ summaries }: { summaries: MonthSummary[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const setAside = (s: MonthSummary) => Math.max(0, s.setAside)
  const anySetAside = summaries.some((s) => setAside(s) > 0)
  const max = Math.max(1, ...summaries.flatMap((s) => [s.income, s.living + setAside(s)]))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / summaries.length
  const barW = Math.min(24, (band - 8) / 2)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const ticks = niceTicks(max, 4)

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Income and living spending by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {compact(t)}
            </text>
          </g>
        ))}
        {summaries.map((s, i) => {
          const cx = PAD.left + band * i + band / 2
          const active = hover === i
          return (
            <g key={s.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
              <Bar x={cx - barW - 1} w={barW} top={y(s.income)} bottom={y(0)} className="series-income" dim={hover !== null && !active} />
              <Bar x={cx + 1} w={barW} top={y(s.living)} bottom={y(0)} className="series-spending" dim={hover !== null && !active} square={setAside(s) > 0} />
              {setAside(s) > 0 && (
                <Bar x={cx + 1} w={barW} top={y(s.living + setAside(s))} bottom={y(s.living)} className="series-set-aside" dim={hover !== null && !active} />
              )}
              <text x={cx} y={H - 8} className="chart-axis" textAnchor="middle">
                {shortMonth(s.month)}
              </text>
            </g>
          )
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
      </svg>
      <div className="chart-legend">
        <span>
          <i className="swatch series-income" /> Income
        </span>
        <span>
          <i className="swatch series-spending" /> Living spending
        </span>
        {anySetAside && (
          <span>
            <i className="swatch series-set-aside" /> Set aside
          </span>
        )}
        {hover !== null && (
          <span className="chart-tooltip">
            <strong>{formatMonth(summaries[hover].month)}</strong> · income {formatCents(summaries[hover].income)} · living{' '}
            {formatCents(summaries[hover].living)}
            {anySetAside && <> · set aside {formatCents(summaries[hover].setAside)}</>} · net{' '}
            <span className={summaries[hover].net < 0 ? 'neg' : 'pos'}>{formatCents(summaries[hover].net)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

function Bar({
  x,
  w,
  top,
  bottom,
  className,
  dim,
  square = false,
}: {
  x: number
  w: number
  top: number
  bottom: number
  className: string
  dim: boolean
  /** Flat top, for a segment with another stacked above it. */
  square?: boolean
}) {
  const h = Math.max(0, bottom - top)
  if (h === 0) return null
  const r = square ? 0 : Math.min(4, h)
  // rounded at the data end, square at the baseline
  const d = `M${x},${bottom} V${top + r} a${r},${r} 0 0 1 ${r},-${r} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${bottom} Z`
  return <path d={d} className={`${className} ${dim ? 'dim' : ''}`} />
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
