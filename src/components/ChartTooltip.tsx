import type { ReactNode } from 'react'

/** Floating readout anchored to a point in an SVG chart's viewBox. Sits above that point, or below it when the point is near the top, and stays inside the plot horizontally. */
export function ChartTooltip({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: ReactNode }) {
  const below = y / h < 0.4
  return (
    <div className={`chart-tip ${below ? 'below' : ''}`} style={{ '--tip-x': `${(x / w) * 100}%`, top: `${(y / h) * 100}%` } as React.CSSProperties}>
      {children}
    </div>
  )
}

export function TipRow({ swatch, label, value }: { swatch?: string; label: string; value: ReactNode }) {
  return (
    <div className="chart-tip-row">
      <span>
        {swatch && <i className={`swatch ${swatch}`} />}
        {label}
      </span>
      <span className="num">{value}</span>
    </div>
  )
}
