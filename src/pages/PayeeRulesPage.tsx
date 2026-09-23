import { CategoryPicker } from '../components/CategoryPicker'
import { useBudget } from '../store/budgetStore'

export function PayeeRulesPage() {
  const file = useBudget((s) => s.file)!
  const setPayeeRule = useBudget((s) => s.setPayeeRule)
  const deletePayeeRule = useBudget((s) => s.deletePayeeRule)
  const rules = Object.entries(file.payeeRules ?? {}).sort(([a], [b]) => a.localeCompare(b))

  return (
    <>
      <header className="page-header">
        <h2>Payee rules</h2>
        <span className="muted">Uncategorized transactions from these payees get the category automatically.</span>
      </header>
      <div className="page-body">
        {rules.length === 0 ? (
          <p className="muted">No rules yet. Pick a category for a transaction and answer “Yes” when asked to always use it for that payee.</p>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>Payee</th>
                <th>Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map(([payee, categoryId]) => (
                <tr key={payee}>
                  <td>{payee}</td>
                  <td>
                    <CategoryPicker file={file} value={categoryId} onChange={(id) => (id ? setPayeeRule(payee, id) : deletePayeeRule(payee))} />
                  </td>
                  <td className="actions">
                    <button className="link danger" onClick={() => deletePayeeRule(payee)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
