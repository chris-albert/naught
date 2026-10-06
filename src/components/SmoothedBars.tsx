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
 * Living spending per month as bars, with its 3-month rolling average drawn over them and a
 * lighter line for rolling income, so a lumpy month reads against the level it sits in.
 */
export function SmoothedBars({
  months,
  living,
  rollingLiving,
  rollingIncome,
}: {
  months: MonthKey[]
  living: Cents[]
  rollingLiving: Cents[]
  rollingIncome: Cents[]
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...living, ...rollingLiving, ...rollingIncome)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / months.length
  const barW = Math.min(32, band - 8)
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const ticks = niceTicks(max, 4)
  const path = (values: Cents[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')

  return (
    <div className="chart">
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Living spending by month with a rolling average">
          <defs>
            <linearGradient id="grad-smoothed" className="grad-spending" x1="0" y1="0" x2="0" y2="1">
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
          {living.map((v, i) => {
            const dim = hover !== null && hover !== i
            const top = y(v)
            const bottom = y(0)
            const h = Math.max(0, bottom - top)
            const r = Math.min(4, h)
            const bx = x(i) - barW / 2
            return (
              <g key={months[i]} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${bx},${bottom} V${top + r} a${r},${r} 0 0 1 ${r},-${r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${bottom} Z`}
                    fill="url(#grad-smoothed)"
                    className={`chart-bar ${dim ? 'dim' : ''}`}
                  />
                )}
                <text x={x(i)} y={H - 8} className={`chart-axis ${hover === i ? 'active' : ''}`} textAnchor="middle">
                  {axisMonth(months[i])}
                </text>
              </g>
            )
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
          <path d={path(rollingIncome)} className="series-rolling-income" />
          <path d={path(rollingLiving)} className="series-rolling-living" />
          {hover !== null && <circle cx={x(hover)} cy={y(rollingLiving[hover])} r={4} className="series-rolling-dot" />}
        </svg>
        {hover !== null && (
          <ChartTooltip x={x(hover)} y={y(Math.max(living[hover], rollingLiving[hover]))} w={W} h={H}>
            <strong>{formatMonth(months[hover])}</strong>
            <TipRow swatch="series-spending" label="Living" value={formatCents(living[hover])} />
            <TipRow swatch="swatch-average" label="3-month average" value={formatCents(rollingLiving[hover])} />
            <TipRow
              label="vs average"
              value={
                living[hover] === rollingLiving[hover] ? (
                  '—'
                ) : (
                  <span className={living[hover] > rollingLiving[hover] ? 'neg' : 'pos'}>
                    {living[hover] > rollingLiving[hover] ? '▲' : '▼'} {formatCents(Math.abs(living[hover] - rollingLiving[hover]))}
                  </span>
                )
              }
            />
            <TipRow swatch="series-income" label="Income, 3-month avg" value={formatCents(rollingIncome[hover])} />
          </ChartTooltip>
        )}
      </div>
      <div className="chart-legend">
        <span>
          <i className="swatch series-spending" /> Living spending
        </span>
        <span>
          <i className="swatch swatch-average" /> 3-month average
        </span>
        <span>
          <i className="swatch swatch-rolling-income" /> Income, 3-month average
        </span>
      </div>
    </div>
  )
}

function axisMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return m === 1 ? `${label} ${y}` : label
}
