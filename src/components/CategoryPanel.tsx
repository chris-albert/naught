import { useEffect, useState } from 'react'
import type { CategoryRow } from '../model/budgetMath'
import { formatCents, parseCents } from '../model/money'
import type { BudgetFile, Cents, MonthKey } from '../model/types'
import { useBudget } from '../store/budgetStore'

/** Shortfall against the category's monthly target, if it has one. */
export function targetShortfall(row: CategoryRow): Cents {
  const { target } = row.category
  return target === undefined ? 0 : Math.max(0, target - row.assigned)
}

/**
 * Detail panel for one budget category, opened by clicking its name. Shows
 * the month's numbers, holds the monthly target, and assigns To budget money
 * toward it.
 */
export function CategoryPanel({
  file,
  month,
  row,
  toBudget,
  onClose,
}: {
  file: BudgetFile
  month: MonthKey
  row: CategoryRow
  toBudget: Cents
  onClose: () => void
}) {
  const updateCategory = useBudget((s) => s.updateCategory)
  const moveAssigned = useBudget((s) => s.moveAssigned)
  const [targetText, setTargetText] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const { category } = row
  const group = file.categoryGroups.find((g) => g.id === category.groupId)
  const target = category.target
  const toGo = targetShortfall(row)
  const over = target === undefined ? 0 : Math.max(0, row.assigned - target)
  const progress = target ? Math.min(100, Math.round((100 * row.assigned) / target)) : 0

  const commitTarget = () => {
    if (targetText !== null) {
      const cents = parseCents(targetText)
      if (cents !== null && cents !== (target ?? 0)) updateCategory(category.id, { target: cents > 0 ? cents : undefined })
    }
    setTargetText(null)
  }

  return (
    <aside className="slideover">
      <div className="slideover-head">
        <div>
          <h3>{category.name}</h3>
          <span className="muted">{group?.name}</span>
        </div>
        <button type="button" className="link close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      <section className="slideover-stats">
        <div>
          <span className="muted">Assigned</span>
          <strong>{formatCents(row.assigned)}</strong>
        </div>
        <div>
          <span className="muted">Activity</span>
          <strong>{formatCents(row.activity)}</strong>
        </div>
        <div>
          <span className="muted">Available</span>
          <strong className={row.available < 0 ? 'neg' : ''}>{formatCents(row.available)}</strong>
        </div>
      </section>

      <section>
        <h4>Monthly target</h4>
        <div className="target-row">
          <input
            className="target-amount"
            value={targetText ?? (target ? formatCents(target) : '')}
            placeholder="No target"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setTargetText(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setTargetText(null)
                e.currentTarget.blur()
              }
            }}
          />
          {target !== undefined && (
            <button type="button" className="link" onClick={() => updateCategory(category.id, { target: undefined })}>
              Remove
            </button>
          )}
        </div>
        {target === undefined ? (
          <p className="muted">Set how much this category needs each month, then assign toward it from here.</p>
        ) : (
          <>
            <div className={`target-bar ${toGo > 0 ? 'under' : ''}`}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <p className={toGo > 0 ? 'warn-text' : 'muted'}>
              {toGo > 0
                ? `${formatCents(toGo)} to go this month.`
                : over > 0
                  ? `Funded, ${formatCents(over)} over the target.`
                  : 'Funded for this month.'}
            </p>
            {toGo > 0 && (
              <div className="target-actions">
                <button type="button" onClick={() => moveAssigned(month, null, category.id, toGo)}>
                  Assign {formatCents(toGo)}
                </button>
                {toBudget < toGo && (
                  <span className="muted">
                    {toBudget > 0 ? `Only ${formatCents(toBudget)} to budget.` : 'Nothing left to budget.'}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h4>Options</h4>
        <label className="option">
          <input type="checkbox" checked={!!category.reserve} onChange={(e) => updateCategory(category.id, { reserve: e.target.checked })} />
          <span>
            Reserve
            <small className="muted">Savings-style: money here is set aside, and spending from it is a draw, not a living expense.</small>
          </span>
        </label>
        <label className="option">
          <input type="checkbox" checked={category.hidden} onChange={(e) => updateCategory(category.id, { hidden: e.target.checked })} />
          <span>
            Hidden
            <small className="muted">Kept out of the budget table unless "show hidden" is on.</small>
          </span>
        </label>
      </section>
    </aside>
  )
}
