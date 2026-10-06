import { useState } from 'react'
import { Link } from 'react-router-dom'
import { computeMonth } from '../model/budgetMath'
import { currentMonth } from '../model/dates'
import { formatCents } from '../model/money'
import { upcomingClosings, type Closing } from '../model/statements'
import type { BudgetFile } from '../model/types'

/**
 * Cards whose statement closes in the next few days: pay them now and the bureaus see a low balance.
 * Dismissing one hides it until its next closing; that lives in this browser only.
 */
export function CardClosings({ file }: { file: BudgetFile }) {
  const [dismissed, setDismissed] = useState(loadDismissed)
  const upcoming = upcomingClosings(file)
  const closings = upcoming.filter((c) => !dismissed.has(key(c)))
  if (closings.length === 0) return null

  const dismiss = (c: Closing) => {
    // Keep only keys for closings still ahead, so old cycles do not pile up.
    const next = new Set([...upcoming.map(key).filter((k) => dismissed.has(k)), key(c)])
    setDismissed(next)
    saveDismissed(next)
  }
  const available = new Map(computeMonth(file, currentMonth()).groups.flatMap((g) => g.rows.map((r) => [r.category.id, r.available] as const)))

  return (
    <div className="closings">
      {closings.map((c) => {
        const setAside = c.account.paymentCategoryId ? available.get(c.account.paymentCategoryId) : undefined
        return (
          <div key={c.account.id}>
            <Link to={`/app/accounts/${c.account.id}`}>
              <strong>{c.account.name}</strong>
            </Link>
            <span>
              {' '}
              closes {when(c.daysLeft, c.closesOn)} · owes {formatCents(c.owed)}
            </span>
            {setAside !== undefined && (
              <span className={setAside < c.owed ? 'short' : 'muted'}> · {formatCents(setAside)} set aside</span>
            )}
            {c.account.bankUrl && (
              <a className="bank-link" href={c.account.bankUrl} target="_blank" rel="noopener noreferrer">
                Pay at bank ↗
              </a>
            )}
            <button className="link dismiss" title="Hide until the next statement" onClick={() => dismiss(c)}>
              Dismiss
            </button>
          </div>
        )
      })}
      <span className="muted">The balance on the closing day is what gets reported to the credit bureaus.</span>
    </div>
  )
}

function when(daysLeft: number, closesOn: string): string {
  if (daysLeft === 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  const day = new Date(`${closesOn}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `in ${daysLeft} days (${day})`
}

const DISMISSED_KEY = 'naught.closings.dismissed'

const key = (c: Closing) => `${c.account.id}:${c.closesOn}`

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function saveDismissed(keys: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...keys]))
  } catch {
    // ignore; the dismissal still holds for this session
  }
}
