import { useEffect, useRef, useState } from 'react'
import { formatCents, parseCents } from '../model/money'
import { categoryForPayee, uncategorizedFrom } from '../model/payeeRules'
import { isSplit, isUncategorized, unassigned } from '../model/splits'
import { INCOME_CATEGORY_ID, type BudgetFile, type Cents, type Split, type Transaction } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { CategoryPicker } from './CategoryPicker'
import { confirm } from './ConfirmDialog'
import { PayeePicker, usePayeeOptions } from './PayeePicker'
import type { PickerHandle } from './Picker'

const LIMIT = 500

export function TransactionTable({
  file,
  transactions,
  showAccount,
  recentlyCategorized,
  onCategorized,
}: {
  file: BudgetFile
  transactions: Transaction[]
  showAccount: boolean
  /** Rows to show in their own "Recently categorized" section instead of by cleared state. */
  recentlyCategorized?: Set<string>
  /** Called after a category is picked by hand, so the page can keep the row visible under a filter. */
  onCategorized?: (transactionId: string) => void
}) {
  const updateTransaction = useBudget((s) => s.updateTransaction)
  const deleteTransaction = useBudget((s) => s.deleteTransaction)
  const setPayeeRule = useBudget((s) => s.setPayeeRule)
  const setTransfer = useBudget((s) => s.setTransfer)
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const categoryName = (id: string) => (id === INCOME_CATEGORY_ID ? 'Income' : file.categories.find((c) => c.id === id)?.name ?? '?')
  // After a category is picked by hand, offer to make it a rule for that payee.
  // One offer per row; each stays until answered.
  const [suggestions, setSuggestions] = useState<Map<string, { payee: string; categoryId: string }>>(new Map())
  const categorize = (t: Transaction, categoryId: string | null) => {
    updateTransaction(t.id, { categoryId })
    onCategorized?.(t.id)
    const offer = categoryId && t.payee && categoryForPayee(file, t.payee) !== categoryId
    setSuggestions((m) => {
      const next = new Map(m)
      if (offer) next.set(t.id, { payee: t.payee, categoryId })
      else next.delete(t.id)
      return next
    })
  }
  const dismiss = (transactionId: string) =>
    setSuggestions((m) => {
      const next = new Map(m)
      next.delete(transactionId)
      return next
    })
  const acceptRule = (transactionId: string, payee: string, categoryId: string) => {
    setPayeeRule(payee, categoryId)
    // The rule answers every pending offer for this payee.
    setSuggestions((m) => new Map([...m].filter(([id, s]) => id !== transactionId && s.payee !== payee)))
  }
  /** Replace the split lines; with none left the transaction is a plain one again, in `categoryId`. */
  const setSplits = (t: Transaction, splits: Split[], categoryId: string | null = null) => {
    updateTransaction(t.id, splits.length ? { splits, categoryId: null } : { splits: undefined, categoryId })
    onCategorized?.(t.id)
    dismiss(t.id)
  }
  /** Start with one line holding everything; lowering its amount leaves the rest to hand out. */
  const startSplit = (t: Transaction) => {
    if (!t.transferAccountId && !isSplit(t)) setSplits(t, [{ categoryId: t.categoryId, amount: t.amount }])
  }
  const { options: payees, transferTo, transferLabel } = usePayeeOptions(file)
  const setPayee = (t: Transaction, payee: string) => {
    const accountId = transferTo(payee)
    if (accountId) setTransfer(t.id, accountId)
    else {
      if (t.transferAccountId) setTransfer(t.id, null)
      updateTransaction(t.id, { payee })
    }
  }

  const recent = transactions.filter((t) => recentlyCategorized?.has(t.id))
  const uncleared = transactions.filter((t) => !recentlyCategorized?.has(t.id) && t.cleared === 'uncleared')
  const rest = transactions.filter((t) => !recentlyCategorized?.has(t.id) && t.cleared !== 'uncleared')
  const shown = rest.slice(0, LIMIT)
  const columns = showAccount ? 7 : 6
  const sections = [
    { title: 'Recently categorized', rows: recent, count: true },
    { title: 'Uncleared', rows: uncleared, count: true },
    { title: 'Cleared', rows: shown, count: false },
  ].filter((s) => s.rows.length > 0)
  // A list that is only cleared rows needs no heading.
  const headings = sections.length > 1 || sections[0]?.title !== 'Cleared'
  const visible = sections.flatMap((s) => s.rows)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const categoryRef = useRef<PickerHandle>(null)
  const payeeRef = useRef<PickerHandle>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  const select = (t: Transaction | undefined) => {
    if (!t) return
    setSelectedId(t.id)
    tableRef.current?.querySelector(`tr[data-id="${t.id}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  /** After categorizing, step to the row above so the next keypress works on it. */
  const setCategory = (t: Transaction, categoryId: string | null) => {
    categorize(t, categoryId)
    const i = visible.findIndex((v) => v.id === t.id)
    if (i > 0) select(visible[i - 1])
  }

  const askDelete = async (t: Transaction) => {
    const ok = await confirm({
      title: 'Delete this transaction?',
      message: `${t.date} · ${t.payee || 'No payee'} · ${formatCents(t.amount)}`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) deleteTransaction(t.id)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable]')) return
      if (target.closest('dialog')) return

      const index = visible.findIndex((t) => t.id === selectedId)
      const move = (delta: number) =>
        select(visible[Math.min(visible.length - 1, Math.max(0, (index < 0 ? (delta > 0 ? -1 : visible.length) : index) + delta))])

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          move(1)
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          move(-1)
          break
        case 'Escape':
          setSelectedId(null)
          break
        case 'c':
          if (index >= 0) {
            e.preventDefault()
            categoryRef.current?.open()
          }
          break
        case 'p':
          if (index >= 0) {
            e.preventDefault()
            payeeRef.current?.open()
          }
          break
        case 's':
          if (index >= 0) {
            e.preventDefault()
            startSplit(visible[index])
          }
          break
        case 'Backspace':
        case 'Delete':
          if (index >= 0) {
            e.preventDefault()
            void askDelete(visible[index])
          }
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const renderSuggestion = (t: Transaction) => {
    const s = suggestions.get(t.id)
    if (!s) return null
    const others = uncategorizedFrom(file, s.payee).filter((o) => o.id !== t.id).length
    return (
      <tr key={`${t.id}-rule`} className="rule-suggestion">
        <td colSpan={columns}>
          <span>
            Always use <strong>{categoryName(s.categoryId)}</strong> for <strong>{s.payee}</strong>?
          </span>
          <button onClick={() => acceptRule(t.id, s.payee, s.categoryId)}>{others > 0 ? `Yes, and categorize ${others} more` : 'Yes'}</button>
          <button className="link" onClick={() => dismiss(t.id)}>
            No
          </button>
        </td>
      </tr>
    )
  }

  const renderSplits = (t: Transaction) => {
    if (!isSplit(t)) return null
    const splits = t.splits!
    const rest = unassigned(t)
    const lead = showAccount ? 3 : 2
    return [
      ...splits.map((s, i) => (
        <tr key={`${t.id}-split-${i}`} className="split-line">
          <td colSpan={lead}></td>
          <td>
            <CategoryPicker file={file} value={s.categoryId} onChange={(categoryId) => setSplits(t, splits.map((x, j) => (j === i ? { ...x, categoryId } : x)))} />
          </td>
          <td className="num">
            <SplitAmount value={s.amount} sign={t.amount < 0 ? -1 : 1} onChange={(amount) => setSplits(t, splits.map((x, j) => (j === i ? { ...x, amount } : x)))} />
          </td>
          <td></td>
          <td className="row-actions">
            <button
              className="link danger"
              title={splits.length === 1 ? 'Stop splitting' : 'Remove line'}
              onClick={() => setSplits(t, splits.filter((_, j) => j !== i), s.categoryId)}
            >
              ✕
            </button>
          </td>
        </tr>
      )),
      rest !== 0 && (
        <tr key={`${t.id}-split-rest`} className="split-line uncategorized">
          <td colSpan={lead} className="muted">
            Left over
          </td>
          <td>
            <CategoryPicker file={file} value={null} onChange={(categoryId) => setSplits(t, [...splits, { categoryId, amount: rest }])} />
          </td>
          <td className={`num ${rest < 0 ? 'neg' : 'pos'}`}>{formatCents(rest)}</td>
          <td colSpan={2}></td>
        </tr>
      ),
    ]
  }

  const renderRow = (t: Transaction) => {
    const selected = t.id === selectedId
    return [
      <tr
        key={t.id}
        data-id={t.id}
        className={`${isUncategorized(t) ? 'uncategorized' : ''} ${selected ? 'selected' : ''}`}
        onClick={() => setSelectedId(t.id)}
      >
        {showAccount && <td>{accountName.get(t.accountId)}</td>}
        <td>{t.date}</td>
        <td>
          <PayeePicker
            ref={selected ? payeeRef : undefined}
            payees={payees}
            exceptAccountId={t.accountId}
            value={t.transferAccountId ? transferLabel(t.transferAccountId) : t.payee}
            onChange={(payee) => setPayee(t, payee)}
          />
        </td>
        <td>
          {t.transferAccountId ? (
            <span className="muted">Transfer: {accountName.get(t.transferAccountId) ?? '?'}</span>
          ) : isSplit(t) ? (
            <span className="muted">Split</span>
          ) : (
            <CategoryPicker
              ref={selected ? categoryRef : undefined}
              file={file}
              value={t.categoryId}
              onChange={(categoryId) => setCategory(t, categoryId)}
            />
          )}
        </td>
        <td className={`num ${t.amount < 0 ? 'neg' : 'pos'}`}>{formatCents(t.amount)}</td>
        <td className="muted">{t.cleared === 'reconciled' ? '🔒' : t.cleared === 'cleared' ? '✓' : ''}</td>
        <td className="row-actions">
          {!t.transferAccountId && !isSplit(t) && (
            <button className="link" title="Split across categories" onClick={() => startSplit(t)}>
              Split
            </button>
          )}
          <button className="link danger" title="Delete transaction" onClick={() => askDelete(t)}>
            ✕
          </button>
        </td>
      </tr>,
      renderSplits(t),
      renderSuggestion(t),
    ]
  }

  return (
    <>
      <table className="grid" ref={tableRef}>
        <thead>
          <tr>
            {showAccount && <th>Account</th>}
            <th>Date</th>
            <th>Payee</th>
            <th>Category</th>
            <th className="num">Amount</th>
            <th></th>
            <th></th>
          </tr>
        </thead>
        {sections.map((s) => (
          <tbody key={s.title}>
            {headings && (
              <tr className="section-row">
                <th colSpan={columns}>
                  {s.title}
                  {s.count ? ` · ${s.rows.length}` : ''}
                </th>
              </tr>
            )}
            {s.rows.map(renderRow)}
          </tbody>
        ))}
      </table>
      {rest.length > LIMIT && (
        <p className="muted">
          Showing {LIMIT} of {rest.length} cleared transactions.
        </p>
      )}
      <p className="muted hotkeys">
        <kbd>j</kbd>/<kbd>k</kbd> or arrows move · <kbd>c</kbd> category · <kbd>p</kbd> payee · <kbd>s</kbd> split · <kbd>⌫</kbd> delete · <kbd>esc</kbd> deselect
      </p>
    </>
  )
}

/** Amount of one split line. A number typed without a sign takes the direction of the whole transaction. */
function SplitAmount({ value, sign, onChange }: { value: Cents; sign: 1 | -1; onChange: (cents: Cents) => void }) {
  const [text, setText] = useState<string | null>(null)

  const commit = () => {
    if (text !== null) {
      const typed = parseCents(text)
      const cents = typed === null ? null : /^\s*[+-]/.test(text) ? typed : sign * Math.abs(typed)
      if (cents !== null && cents !== value) onChange(cents)
    }
    setText(null)
  }

  return (
    <input
      className="assigned"
      value={text ?? formatCents(value)}
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
