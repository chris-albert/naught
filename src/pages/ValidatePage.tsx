import { formatMonth } from '../model/dates'
import { formatCents } from '../model/money'
import { validateToBudget, type LedgerMonth } from '../model/validate'
import { useBudget } from '../store/budgetStore'

const columns: [keyof LedgerMonth, string][] = [
  ['income', 'Income'],
  ['assigned', 'Assigned'],
  ['uncategorized', 'Uncategorized'],
  ['cashOverspentPrior', 'Cash overspent (prior)'],
  ['released', 'Released'],
  ['aheadChange', 'Assigned ahead Δ'],
  ['ledger', 'Ledger'],
  ['balance', 'Balance'],
]

export function ValidatePage() {
  const file = useBudget((s) => s.file)!
  const months = validateToBudget(file)
  const off = months.filter((m) => m.ledger !== m.balance)

  return (
    <>
      <header className="page-header">
        <h2>Validate</h2>
        <span className="muted">
          To Budget worked out two ways: as a running ledger (last month + income − assigned + uncategorized − prior cash overspending + released − assigned-ahead change)
          and as the budget page derives it from balances. They should match every month.
        </span>
      </header>
      <div className="page-body">
        <p className={off.length === 0 ? 'muted' : 'neg'}>
          {months.length === 0 ? 'Nothing to check yet.' : off.length === 0 ? `All ${months.length} months agree.` : `${off.length} of ${months.length} months disagree.`}
        </p>
        {months.length > 0 && (
          <table className="grid">
            <thead>
              <tr>
                <th>Month</th>
                {columns.map(([key, label]) => (
                  <th key={key} className="num">
                    {label}
                  </th>
                ))}
                <th className="num">Difference</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const diff = m.balance - m.ledger
                return (
                  <tr key={m.month}>
                    <td>{formatMonth(m.month)}</td>
                    {columns.map(([key]) => (
                      <td key={key} className="num">
                        {formatCents(m[key] as number)}
                      </td>
                    ))}
                    <td className="num neg">{diff === 0 ? '' : formatCents(diff)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
