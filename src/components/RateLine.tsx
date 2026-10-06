import { useState } from 'react'
import { formatMonth } from '../model/dates'
import type { MonthKey } from '../model/types'
import { ChartTooltip, TipRow } from './ChartTooltip'

const W = 900
const H = 180
const PAD = { top: 12, right: 12, bottom: 28, left: 56 }

/**
 * Savings rate per month as a line, with a dashed line for its 3-month rolling average.
 * Months without income have no rate and break the line.
 */
export function RateLine({ months, rates, rolling }: { months: MonthKey[]; rates: (number | null)[]; rolling: (number | null)[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const known = [...rates, ...rolling].filter((r): r is number => r !== null)
  const hi = Math.max(0.1, ...known)
  const lo = Math.min(0, ...known)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / months.length
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH
  const ticks = percentTicks(lo, hi)
  const hovered = hover === null ? null : rates[hover]

  return (
    <div className="chart">
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Savings rate by month">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-baseline' : 'chart-grid'} />
              <text x={PAD.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="chart-crosshair" />}
          <path d={linePath(rolling, x, y)} className="series-rate-rolling" />
          <path d={linePath(rates, x, y)} className="series-rate-halo" />
          <path d={linePath(rates, x, y)} className="series-rate-line" />
          {months.map((m, i) => (
            <g key={m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
              {rates[i] !== null && (hover === i || (hover === null && i === months.length - 1)) && (
                <circle cx={x(i)} cy={y(rates[i]!)} r={5} className="series-rate-dot" />
              )}
              <text x={x(i)} y={H - 8} className={`chart-axis ${hover === i ? 'active' : ''}`} textAnchor="middle">
                {axisMonth(m)}
              </text>
            </g>
          ))}
        </svg>
        {hover !== null && (
          <ChartTooltip x={x(hover)} y={y(hovered ?? 0)} w={W} h={H}>
            <strong>{formatMonth(months[hover])}</strong>
            <TipRow swatch="series-rate" label="Savings rate" value={hovered === null ? <span className="muted">no income</span> : pct(hovered)} />
            <TipRow swatch="swatch-average" label="3-month average" value={rolling[hover] === null ? '—' : pct(rolling[hover]!)} />
          </ChartTooltip>
        )}
      </div>
      <div className="chart-legend">
        <span>
          <i className="swatch series-rate" /> Savings rate
        </span>
        <span>
          <i className="swatch swatch-average" /> 3-month average
        </span>
      </div>
    </div>
  )
}

/** Path through the known points; a gap wherever a value is missing. */
function linePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i)},${y(v)} `
    pen = true
  })
  return d
}

function percentTicks(lo: number, hi: number): number[] {
  const span = hi - lo
  const step = span > 1 ? 0.5 : span > 0.5 ? 0.25 : span > 0.2 ? 0.1 : 0.05
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}

const pct = (r: number) => <span className={r < 0 ? 'neg' : 'pos'}>{Math.round(r * 100)}%</span>

function axisMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return m === 1 ? `${label} ${y}` : label
}
