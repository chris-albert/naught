import type { Cents } from '../model/types'

const W = 90
const H = 24
const PAD = 2

/** Tiny inline line of a series, for a table cell. Net money in dips to the bottom edge. */
export function Sparkline({ values }: { values: Cents[] }) {
  if (values.length < 2) return null
  const hi = Math.max(1, ...values)
  const lo = Math.min(0, ...values)
  const x = (i: number) => PAD + ((W - 2 * PAD) * i) / (values.length - 1)
  const y = (v: number) => PAD + ((hi - v) / (hi - lo)) * (H - 2 * PAD)
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const area = `${line} L${x(values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sparkline" aria-hidden="true">
      <path d={area} className="sparkline-area" />
      <path d={line} className="sparkline-line" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2} className="sparkline-dot" />
    </svg>
  )
}
