import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GroupRow } from '../model/budgetMath'
import { formatCents } from '../model/money'
import { buildReport, monthRange } from '../model/reports'
import { trendPath } from '../model/trend'
import { CREDIT_CARD_PAYMENTS_GROUP, type BudgetFile, type MonthKey } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { NameInput } from './NameInput'
import { PanelTrend } from './PanelTrend'

const TREND_MONTHS = 6

/**
 * Detail panel for one category group, opened by clicking its row. Shows the
 * month's totals, each category's share, and the group's spending trend.
 */
export function GroupPanel({
  file,
  month,
  row,
  showHidden,
  onClose,
  onSelectCategory,
}: {
  file: BudgetFile
  month: MonthKey
  row: GroupRow
  showHidden: boolean
  onClose: () => void
  onSelectCategory: (categoryId: string) => void
}) {
  const updateCategoryGroup = useBudget((s) => s.updateCategoryGroup)
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const { group } = row
  // The credit card group is managed by the app: no rename, no hiding.
  const managed = group.name === CREDIT_CARD_PAYMENTS_GROUP
  const rows = row.rows.filter((r) => showHidden || !r.category.hidden)
  // Same figures as the Reports page: net money out per month, ending at this month.
  const trendMonths = useMemo(() => monthRange(month, TREND_MONTHS), [month])
  const trend = useMemo(() => buildReport(file, trendMonths).groups.find((g) => g.group.id === group.id), [file, trendMonths, group.id])

  return (
    <aside className="slideover">
      <div className="slideover-head">
        <div>
          {renaming ? (
            <NameInput
              className="rename-category"
              initial={group.name}
              onCommit={(name) => {
                if (name !== group.name) updateCategoryGroup(group.id, { name })
                setRenaming(false)
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <h3>
              {managed ? (
                group.name
              ) : (
                <button type="button" className="link rename-title" title="Rename" onClick={() => setRenaming(true)}>
                  {group.name}
                </button>
              )}
            </h3>
          )}
          <span className="muted">
            Category group · <Link to={trendPath({ kind: 'group', id: group.id })}>Spending over time ›</Link>
          </span>
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
          <strong className={row.available < 0 ? 'neg' : row.available > 0 ? 'pos' : ''}>{formatCents(row.available)}</strong>
        </div>
      </section>

      <section>
        <h4>Categories{rows.length > 0 && ` · ${rows.length}`}</h4>
        {rows.length === 0 ? (
          <p className="muted">Nothing here yet. Use the + on the group's row to add one.</p>
        ) : (
          <ul className="panel-transactions panel-categories">
            <li className="head">
              <span>Category</span>
              <span className="num">Activity</span>
              <span className="num">Available</span>
            </li>
            {rows.map((r) => (
              <li key={r.category.id}>
                <button type="button" className="link" onClick={() => onSelectCategory(r.category.id)}>
                  {r.category.name}
                </button>
                <span className="num">{formatCents(r.activity)}</span>
                <span className={`num ${r.available < 0 ? 'neg' : r.available > 0 ? 'pos' : ''}`}>{formatCents(r.available)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {trend && trend.total !== 0 && (
        <section>
          <h4>Last {TREND_MONTHS} months</h4>
          <PanelTrend report={trend} months={trendMonths} />
        </section>
      )}

      {!managed && (
        <section>
          <h4>Options</h4>
          <label className="option">
            <input type="checkbox" checked={group.hidden} onChange={(e) => updateCategoryGroup(group.id, { hidden: e.target.checked })} />
            <span>
              Hidden
              <small className="muted">Kept out of the budget table unless "show hidden" is on.</small>
            </span>
          </label>
        </section>
      )}
    </aside>
  )
}
