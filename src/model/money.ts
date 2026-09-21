import type { Cents } from './types'

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCents(cents: Cents): string {
  return fmt.format(cents / 100)
}

/** Parse user input like "$1,234.5" or "-20" into cents. Returns null if unparseable. */
export function parseCents(input: string): Cents | null {
  const cleaned = input.replace(/[$,\s]/g, '')
  if (cleaned === '' || cleaned === '-') return 0
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}
