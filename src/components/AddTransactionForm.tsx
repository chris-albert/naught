import { useState } from 'react'
import { parseCents } from '../model/money'
import type { BudgetFile } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { CategoryPicker } from './CategoryPicker'
import { PayeePicker, usePayeeOptions } from './PayeePicker'

/** Local calendar date; toISOString would roll to tomorrow in the evening in western time zones. */
const today = () => new Date().toLocaleDateString('en-CA')

/** Manual entry. New rows start uncleared so a later bank sync can match and clear them. */
export function AddTransactionForm({ file, accountId }: { file: BudgetFile; accountId: string }) {
  const addTransaction = useBudget((s) => s.addTransaction)
  const setTransfer = useBudget((s) => s.setTransfer)
  const [date, setDate] = useState(today)
  const [payee, setPayee] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [outflow, setOutflow] = useState('')
  const [inflow, setInflow] = useState('')

  const { options: payees, transferTo } = usePayeeOptions(file)
  const transferAccountId = transferTo(payee)

  const out = parseCents(outflow)
  const inn = parseCents(inflow)
  const amount = out === null || inn === null ? null : inn - Math.abs(out)
  const canSubmit = /^\d{4}-\d{2}-\d{2}$/.test(date) && amount !== null && amount !== 0

  const submit = () => {
    if (!canSubmit) return
    const id = addTransaction({ accountId, date, payee: payee.trim(), categoryId, memo: '', amount, cleared: 'uncleared', transferAccountId: null })
    if (transferAccountId) setTransfer(id, transferAccountId)
    setPayee('')
    setCategoryId(null)
    setOutflow('')
    setInflow('')
  }

  return (
    <section className="card">
      <h3>Add a transaction</h3>
      <form
        className="add-transaction"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <PayeePicker payees={payees} exceptAccountId={accountId} value={payee} onChange={setPayee} />
        {transferAccountId ? <span className="muted">Transfer</span> : <CategoryPicker file={file} value={categoryId} onChange={setCategoryId} />}
        <input className="amount" placeholder="Outflow" value={outflow} onChange={(e) => setOutflow(e.target.value)} />
        <input className="amount" placeholder="Inflow" value={inflow} onChange={(e) => setInflow(e.target.value)} />
        <button type="submit" disabled={!canSubmit}>
          Add
        </button>
      </form>
    </section>
  )
}
