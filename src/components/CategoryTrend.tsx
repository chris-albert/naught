import { useState } from 'react'
import { formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import type { CategoryReport } from '../model/reports'
import type { MonthKey } from '../model/types'

const H = 120
const TOP = 14 // headroom so a line at the top of the scale does not sit on the row's edge

/**
 * Detail row under a category in the report table. Each month column gets its own bar, so the bars
 * sit directly under the figures above them; dashed lines mark the average across the range and the
 * monthly target (if set), labelled in the Average and Total columns. Net money in dips below the baseline.
 */
export function CategoryTrend({ report, months }: { report: CategoryReport; months: MonthKey[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const values = report.byMonth
  const target = report.category.target
  const hi = Math.max(1, report.average, target ?? 0, ...values)
  const lo = Math.min(0, ...values)
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (H - TOP)
  const showAverage = report.average > 0
  // when the average and target lines sit close together, each label moves to its own side of the pair
  const crowded = showAverage && target !== undefined && Math.abs(y(target) - y(report.average)) < 16
  const labelTop = (v: number, upper: boolean) => Math.min(H - 16, Math.max(0, crowded ? (upper ? y(v) - 16 : y(v)) : y(v) - 8))

  return (
    <tr className="category-detail">
      <td>
        <div className="trend-legend">
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
              <i className="swatch swatch-average" /> Average
            </span>
          )}
          {target !== undefined && (
            <span>
              <i className="swatch swatch-target" /> Target
            </span>
          )}
        </div>
        {hover !== null && (
          <div className="trend-readout">
            <strong>{formatMonth(months[hover])}</strong> ·{' '}
            {values[hover] < 0 ? <span className="pos">+{formatCents(-values[hover])}</span> : formatCents(values[hover])}
            {showAverage && (
              <>
                {' '}
                · {formatCents(Math.abs(values[hover] - report.average))} {values[hover] < report.average ? 'below' : 'above'} average
              </>
            )}
          </div>
        )}
      </td>
      {values.map((v, i) => (
        <td key={months[i]} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <div className="trend-plot">
            <div className="trend-line baseline" style={{ top: y(0) }} />
            {showAverage && <div className="trend-line average" style={{ top: y(report.average) }} />}
            {target !== undefined && <div className="trend-line target" style={{ top: y(target) }} />}
            {v !== 0 && (
              <div
                className={`trend-bar ${v > 0 ? 'out' : 'in'} ${hover !== null && hover !== i ? 'dim' : ''}`}
                style={v > 0 ? { top: y(v), height: y(0) - y(v) } : { top: y(0), height: y(v) - y(0) }}
              />
            )}
          </div>
        </td>
      ))}
      <td colSpan={2}>
        <div className="trend-plot">
          {showAverage && (
            <span className="trend-label" style={{ top: labelTop(report.average, target === undefined || report.average >= target) }}>
              avg {formatCents(report.average)}
            </span>
          )}
          {target !== undefined && (
            <span className="trend-label" style={{ top: labelTop(target, !showAverage || target > report.average) }}>
              target {formatCents(target)}
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}
