import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MoveMoneyDialog, type MoveTarget } from '../components/MoveMoneyDialog'
import { computeMonth } from '../model/budgetMath'
import { addMonths, currentMonth, formatMonth } from '../model/dates'
import { formatCents, parseCents } from '../model/money'
import type { Cents } from '../model/types'
import { useBudget } from '../store/budgetStore'

export function BudgetPage() {
  const { month = currentMonth() } = useParams()
  const file = useBudget((s) => s.file)!
  const setAssigned = useBudget((s) => s.setAssigned)
  const [showHidden, setShowHidden] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null)

  const toggleGroup = (id: string) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
    saveCollapsed(next)
  }

  const budget = computeMonth(file, month)
  const groups = budget.groups.filter((g) => showHidden || !g.group.hidden)

  return (
    <>
      <header className="page-header">
        <div className="month-nav">
          <Link to={`/app/budget/${addMonths(month, -1)}`}>‹</Link>
          <h2>{formatMonth(month)}</h2>
          <Link to={`/app/budget/${addMonths(month, 1)}`}>›</Link>
        </div>
        <div className={`stat to-budget ${budget.toBudget < 0 ? 'over' : ''}`}>
          <span className="muted">To budget</span>
          <strong>{formatCents(budget.toBudget)}</strong>
        </div>
        <div className="stat">
          <span className="muted">Income</span>
          <span>{formatCents(budget.income)}</span>
        </div>
        <div className="stat">
          <span className="muted">Assigned</span>
          <span>{formatCents(budget.totalAssigned)}</span>
        </div>
        <label className="muted">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> show hidden
        </label>
      </header>
      <div className="page-body">

      <table className="grid budget">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Assigned</th>
            <th className="num">Activity</th>
            <th className="num">Available</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.group.id}>
            <tr className={`group-row ${collapsed.has(g.group.id) ? 'collapsed' : ''}`} onClick={() => toggleGroup(g.group.id)}>
              <th>
                <span className="chevron">▾</span> {g.group.name}
              </th>
              <th className={`num ${tint(g.assigned)}`}>{formatCents(g.assigned)}</th>
              <th className={`num ${tint(g.activity)}`}>{formatCents(g.activity)}</th>
              <th className="num">{formatCents(g.available)}</th>
            </tr>
            {!collapsed.has(g.group.id) &&
              g.rows
                .filter((r) => showHidden || !r.category.hidden)
                .map((r) => (
                <tr key={r.category.id}>
                  <td>{r.category.name}</td>
                  <td className={`num ${tint(r.assigned)}`}>
                    <AssignedCell value={r.assigned} onChange={(cents) => setAssigned(month, r.category.id, cents)} />
                  </td>
                  <td className={`num ${tint(r.activity)}`}>{formatCents(r.activity)}</td>
                  <td className="num">
                    <button
                      type="button"
                      className={`pill ${r.available < 0 ? 'neg' : r.available > 0 ? 'pos' : 'zero'}`}
                      disabled={r.available === 0}
                      title={r.available < 0 ? 'Cover overspending' : r.available > 0 ? 'Move money' : undefined}
                      onClick={() => setMoveTarget({ category: r.category, available: r.available })}
                    >
                      {formatCents(r.available)}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        ))}
      </table>
      </div>
      <MoveMoneyDialog file={file} month={month} target={moveTarget} onClose={() => setMoveTarget(null)} />
    </>
  )
}

function AssignedCell({ value, onChange }: { value: Cents; onChange: (cents: Cents) => void }) {
  const [text, setText] = useState<string | null>(null)

  const commit = () => {
    if (text !== null) {
      const cents = parseCents(text)
      if (cents !== null && cents !== value) onChange(cents)
    }
    setText(null)
  }

  return (
    <input
      className="assigned"
      value={text ?? (value === 0 ? '' : formatCents(value))}
      placeholder="$0.00"
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setText(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

const tint = (cents: Cents) => (cents > 0 ? 'soft-pos' : cents < 0 ? 'soft-neg' : '')

const COLLAPSED_KEY = 'naught.budget.collapsed'

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function saveCollapsed(ids: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore; collapsing still works for this session
  }
}
