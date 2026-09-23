import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCents, parseCents } from '../model/money'
import type { BudgetFile, Category, Cents, MonthKey } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { Picker, type PickerOption } from './Picker'

export interface MoveTarget {
  category: Category
  available: Cents
}

const TO_BUDGET = '__to_budget__'

/**
 * Opened from the Available column. Positive available: move some of it to
 * another category. Negative: cover the overspending from another category.
 */
export function MoveMoneyDialog({
  file,
  month,
  target,
  onClose,
}: {
  file: BudgetFile
  month: MonthKey
  target: MoveTarget | null
  onClose: () => void
}) {
  const moveAssigned = useBudget((s) => s.moveAssigned)
  const ref = useRef<HTMLDialogElement>(null)
  const [other, setOther] = useState<string | null>(null)
  const [amountText, setAmountText] = useState('')

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (target && !d.open) {
      setOther(null)
      setAmountText(formatCents(target.available))
      d.showModal()
    }
    if (!target && d.open) d.close()
  }, [target])

  const options = useMemo<PickerOption[]>(() => {
    const groupOrder = new Map(file.categoryGroups.map((g, i) => [g.id, i]))
    const groupName = new Map(file.categoryGroups.map((g) => [g.id, g.name]))
    return [
      { key: TO_BUDGET, label: 'To budget' },
      ...file.categories
        .filter((c) => !c.hidden && c.id !== target?.category.id)
        .sort((a, b) => (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0))
        .map((c) => ({ key: c.id, label: c.name, group: groupName.get(c.groupId) ?? '' })),
    ]
  }, [file.categories, file.categoryGroups, target])

  if (!target) return <dialog ref={ref} className="confirm" />

  const covering = target.available < 0
  const amount = covering ? -target.available : parseCents(amountText)
  const canSubmit = other !== null && amount !== null && amount > 0
  const otherId = other === TO_BUDGET ? null : other

  const submit = () => {
    if (!canSubmit) return
    if (covering) moveAssigned(month, otherId, target.category.id, amount)
    else moveAssigned(month, target.category.id, otherId, amount)
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className="confirm"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <form
        className="confirm-body"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h3>{covering ? 'Cover with' : 'Move money'}</h3>
        <p className="muted">
          {covering
            ? `${target.category.name} is overspent by ${formatCents(-target.available)}.`
            : `From ${target.category.name} (${formatCents(target.available)} available).`}
        </p>
        {!covering && (
          <label className="move-row">
            <span>Amount</span>
            <input
              className="move-amount"
              value={amountText}
              autoFocus
              onFocus={(e) => e.target.select()}
              onChange={(e) => setAmountText(e.target.value)}
            />
          </label>
        )}
        <div className="move-row">
          <span>{covering ? 'Cover with' : 'To'}</span>
          <Picker options={options} value={other ?? ''} placeholder="Choose a category" onChange={setOther} />
        </div>
        <div className="confirm-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}>
            {covering ? 'Cover' : 'Move'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
