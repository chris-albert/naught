import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryPicker } from '../components/CategoryPicker'
import { confirm } from '../components/ConfirmDialog'
import { importYnab } from '../import/ynab'
import { convertHoldingCategory, previewHoldingConversion } from '../model/holding'
import { formatCents } from '../model/money'
import { INCOME_CATEGORY_ID } from '../model/types'
import { useBudget } from '../store/budgetStore'

export function ImportPage() {
  const file = useBudget((s) => s.file)!
  const update = useBudget((s) => s.update)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [holding, setHolding] = useState<string | null>(null)
  const preview = holding ? previewHoldingConversion(file, holding) : null

  const convert = async () => {
    if (!holding || !preview) return
    const name = file.categories.find((c) => c.id === holding)?.name ?? 'category'
    const ok = await confirm({
      title: `Convert “${name}” history to income?`,
      message: `${preview.transactions} inflows totalling ${formatCents(preview.total)} across ${preview.months} months become Income, with matching assignments to ${name} so no balance changes. Keep a backup first.`,
      confirmLabel: 'Convert',
    })
    if (ok) {
      update((current) => convertHoldingCategory(current, holding))
      setHolding(null)
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    try {
      const imported = importYnab(JSON.parse(await f.text()))
      update((current) => ({ ...imported, name: current.name || imported.name }))
      navigate('/budget')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <header className="page-header">
        <h2>Import</h2>
      </header>
      <div className="page-body">
      <section className="card">
        <h3>YNAB budget export (JSON)</h3>
        <p className="muted">
          The file produced by <code>ynab-export</code> or the YNAB API's <code>/budgets/&#123;id&#125;</code> endpoint.
          This replaces everything in the current budget.
        </p>
        <input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} />
        {error && <p className="neg">{error}</p>}
      </section>

      <section className="card">
        <h3>Convert a holding category to income</h3>
        <p className="muted">
          If you parked paychecks in a category (a YNAB-style “Buffer”) and released them with negative assignments,
          this rewrites that history: each inflow becomes Income and the same amount is assigned to the category in that
          month. Every category balance and every month's To Budget stay exactly as they are; only Income becomes
          accurate.
        </p>
        <div className="button-row" style={{ alignItems: 'center' }}>
          <CategoryPicker file={file} value={holding} onChange={(id) => setHolding(id === INCOME_CATEGORY_ID ? null : id)} />
          {preview && (
            <span className="muted">
              {preview.transactions} inflows · {formatCents(preview.total)} · {preview.months} months
            </span>
          )}
          <button onClick={convert} disabled={!preview || preview.transactions === 0}>
            Convert
          </button>
        </div>
      </section>
      </div>
    </>
  )
}
