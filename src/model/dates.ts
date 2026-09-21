import type { MonthKey } from './types'

export function monthOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7)
}

export function currentMonth(): MonthKey {
  return new Date().toISOString().slice(0, 7)
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

export function formatMonth(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
