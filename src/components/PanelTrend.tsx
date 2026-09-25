import { useState } from 'react'
import { formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import type { CategoryReport } from '../model/reports'
import type { MonthKey } from '../model/types'

const H = 80
const TOP = 8 // headroom so a line at the top of the scale does not sit on the plot's edge

/**
 * Compact version of the Reports trend for the category panel: one bar per month, dashed lines for
 * the average across the range and the monthly target (if set). Net money in dips below the baseline.
 */
export function PanelTrend({ report, months }: { report: CategoryReport; months: MonthKey[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const values = report.byMonth
  const target = report.category.target
  const hi = Math.max(1, report.average, target ?? 0, ...values)
  const lo = Math.min(0, ...values)
  const y = (v: number) => TOP + ((hi - v) / (hi - lo)) * (H - TOP)
  const showAverage = report.average > 0

  return (
    <div className="panel-trend">
      <div className="panel-trend-columns">
        {values.map((v, i) => (
          <div key={months[i]} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="trend-plot" style={{ height: H }}>
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
            <span className={`muted ${hover === i ? 'active' : ''}`}>{shortMonth(months[i])}</span>
          </div>
        ))}
      </div>
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
            <i className="swatch swatch-average" /> Average {formatCents(report.average)}
          </span>
        )}
        {target !== undefined && (
          <span>
            <i className="swatch swatch-target" /> Target {formatCents(target)}
          </span>
        )}
      </div>
      <div className="trend-readout">
        {hover !== null && (
          <>
            <strong>{formatMonth(months[hover])}</strong> ·{' '}
            {values[hover] < 0 ? <span className="pos">+{formatCents(-values[hover])}</span> : formatCents(values[hover])}
            {showAverage && (
              <>
                {' '}
                · {formatCents(Math.abs(values[hover] - report.average))} {values[hover] < report.average ? 'below' : 'above'} average
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** "Apr" from a month key, without timezone drift. */
function shortMonth(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}
