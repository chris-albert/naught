import { useState } from 'react'
import type { SpendingCurve as Curve } from '../model/home'
import { formatCents } from '../model/money'
import { ChartTooltip, TipRow } from './ChartTooltip'
import { compact, niceTicks } from './MonthlyBars'

const W = 900
const H = 220
const PAD = { top: 12, right: 16, bottom: 28, left: 56 }

/** Living spending adding up through the month as a line that stops at today, over a dashed line of how it usually adds up. */
export function SpendingCurve({ curve, monthLabel }: { curve: Curve; /** "Nov", for the day labels. */ monthLabel: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const { actual, usual } = curve
  const days = Math.max(actual.length, usual.length)
  const lo = Math.min(0, ...actual, ...usual)
  const hi = Math.max(1, ...actual, ...usual)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / days
  const x = (i: number) => PAD.left + band * i + band / 2
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH
  const line = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const today = actual.length - 1
  const area = `${line(actual)} L${x(today)},${y(0)} L${x(0)},${y(0)} Z`
  const at = hover ?? today
  const diff = usual.length ? actual[Math.min(at, today)] - usual[at] : 0

  return (
    <div className="chart">
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Living spending through the month against the usual">
          {niceTicks(hi, 4).map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={PAD.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                {compact(t)}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="chart-baseline" />
          <path d={area} className="series-spent-area" />
          {usual.length > 0 && <path d={line(usual)} className="series-usual-line" />}
          <path d={line(actual)} className="series-spent-line" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="chart-crosshair" />}
          {hover !== null && usual.length > 0 && <circle cx={x(hover)} cy={y(usual[hover])} r={4} className="series-usual-dot" />}
          {(hover === null || hover <= today) && <circle cx={x(Math.min(at, today))} cy={y(actual[Math.min(at, today)])} r={5} className="series-spent-dot" />}
          {Array.from({ length: days }, (_, i) => (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
              {i % 7 === 0 && (
                <text x={x(i)} y={H - 8} className={`chart-axis ${hover === i ? 'active' : ''}`} textAnchor="middle">
                  {monthLabel} {i + 1}
                </text>
              )}
            </g>
          ))}
          {hover === null && (
            <text
              x={x(today) + (today < days / 2 ? 10 : -10)}
              y={Math.max(y(actual[today]) - 12, PAD.top + 8)}
              className="chart-label"
              textAnchor={today < days / 2 ? 'start' : 'end'}
              dominantBaseline="middle"
            >
              {formatCents(actual[today])}
            </text>
          )}
        </svg>
        {hover !== null && (
          <ChartTooltip x={x(hover)} y={y(Math.max(actual[Math.min(hover, today)], usual[hover] ?? 0))} w={W} h={H}>
            <strong>
              {monthLabel} {hover + 1}
            </strong>
            {hover <= today && <TipRow swatch="series-spending" label="Spent" value={formatCents(actual[hover])} />}
            {usual.length > 0 && <TipRow swatch="swatch-usual" label="Usual" value={formatCents(usual[hover])} />}
            {hover <= today && usual.length > 0 && (
              <TipRow
                label="Difference"
                value={diff === 0 ? <span className="muted">–</span> : <span className={diff > 0 ? 'neg' : 'pos'}>{diff > 0 ? '+' : '−'}{formatCents(Math.abs(diff))}</span>}
              />
            )}
          </ChartTooltip>
        )}
      </div>
      <div className="chart-legend">
        <span>
          <i className="swatch series-spending" /> Spent this month
        </span>
        {usual.length > 0 && (
          <span>
            <i className="swatch swatch-usual" /> Usual by that day
          </span>
        )}
      </div>
    </div>
  )
}
