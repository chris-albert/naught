import { useState } from 'react'
import { formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import type { Cents, MonthKey } from '../model/types'
import { ChartTooltip, TipRow } from './ChartTooltip'
import { compact, niceTicks } from './MonthlyBars'

const W = 900
const H = 220
const PAD = { top: 12, right: 12, bottom: 28, left: 56 }

/**
 * One bar per month of net money out, with a dashed line for the average across the range and one for the
 * monthly target when there is one. Net money in dips below the baseline in the income colour.
 */
export function TrendBars({ months, values, average, target }: { months: MonthKey[]; values: Cents[]; average: Cents; target?: Cents }) {
  const [hover, setHover] = useState<number | null>(null)
  const hi = Math.max(1, average, target ?? 0, ...values)
  const lo = Math.min(0, ...values)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / months.length
  const barW = Math.min(32, band - 8)
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH
  const ticks = niceTicks(hi, 4)
  const showAverage = average > 0

  return (
    <div className="chart">
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Spending by month">
          <defs>
            <linearGradient id="grad-trend-out" className="grad-spending" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" />
              <stop offset="1" />
            </linearGradient>
            <linearGradient id="grad-trend-in" className="grad-income" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" />
              <stop offset="1" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={PAD.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                {compact(t)}
              </text>
            </g>
          ))}
          {hover !== null && <rect x={PAD.left + band * hover} y={PAD.top} width={band} height={innerH} className="chart-hover-band" rx={6} />}
          {values.map((v, i) => {
            const cx = PAD.left + band * i + band / 2
            const dim = hover !== null && hover !== i
            return (
              <g key={months[i]} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
                {v > 0 && <Bar x={cx - barW / 2} w={barW} top={y(v)} bottom={y(0)} fill="url(#grad-trend-out)" dim={dim} />}
                {v < 0 && <Bar x={cx - barW / 2} w={barW} top={y(0)} bottom={y(v)} fill="url(#grad-trend-in)" dim={dim} flip />}
                <text x={cx} y={H - 8} className={`chart-axis ${hover === i ? 'active' : ''}`} textAnchor="middle">
                  {shortMonth(months[i])}
                </text>
              </g>
            )
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
          {showAverage && <line x1={PAD.left} x2={W - PAD.right} y1={y(average)} y2={y(average)} className="chart-average" />}
          {target !== undefined && <line x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} className="chart-target" />}
        </svg>
        {hover !== null && (
          <ChartTooltip x={PAD.left + band * hover + band / 2} y={y(Math.max(0, values[hover]))} w={W} h={H}>
            <strong>{formatMonth(months[hover])}</strong>
            <TipRow
              swatch={values[hover] < 0 ? 'series-income' : 'series-spending'}
              label={values[hover] < 0 ? 'Net money in' : 'Spent'}
              value={values[hover] < 0 ? <span className="pos">+{formatCents(-values[hover])}</span> : formatCents(values[hover])}
            />
            {showAverage && (
              <TipRow
                label="vs average"
                value={
                  <span className={values[hover] > average ? 'neg' : 'pos'}>
                    {values[hover] > average ? '▲' : '▼'} {formatCents(Math.abs(values[hover] - average))}
                  </span>
                }
              />
            )}
          </ChartTooltip>
        )}
      </div>
      <div className="chart-legend">
        <span>
          <i className="swatch series-spending" /> Spent
        </span>
        {values.some((v) => v < 0) && (
          <span>
            <i className="swatch series-income" /> Net money in
          </span>
        )}
        {showAverage && (
          <span>
            <i className="swatch swatch-average" /> Average {formatCents(average)}
          </span>
        )}
        {target !== undefined && (
          <span>
            <i className="swatch swatch-target" /> Target {formatCents(target)}
          </span>
        )}
      </div>
    </div>
  )
}

function Bar({ x, w, top, bottom, fill, dim, flip = false }: { x: number; w: number; top: number; bottom: number; fill: string; dim: boolean; flip?: boolean }) {
  const h = Math.max(0, bottom - top)
  if (h === 0) return null
  const r = Math.min(4, h)
  // rounded at the data end, square at the baseline
  const d = flip
    ? `M${x},${top} V${bottom - r} a${r},${r} 0 0 0 ${r},${r} h${w - 2 * r} a${r},${r} 0 0 0 ${r},-${r} V${top} Z`
    : `M${x},${bottom} V${top + r} a${r},${r} 0 0 1 ${r},-${r} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${bottom} Z`
  return <path d={d} fill={fill} className={`chart-bar ${dim ? 'dim' : ''}`} />
}

function shortMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return m === 1 ? `${label} ${y}` : label
}
