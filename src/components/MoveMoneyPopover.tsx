import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCents, parseCents } from '../model/money'
import type { BudgetFile, Category, Cents, MonthKey } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { Picker, type PickerOption } from './Picker'

export interface MoveTarget {
  category: Category
  available: Cents
  /** Screen rect of the pill that was clicked; the popover hangs below it. */
  anchor: DOMRect
}

const TO_BUDGET = '__to_budget__'

/**
 * Opened from the Available column. Positive available: move some of it to
 * another category. Negative: cover the overspending from another category.
 */
export function MoveMoneyPopover({
  file,
  month,
  target,
  onClose,
}: {
  file: BudgetFile
  month: MonthKey
  target: MoveTarget
  onClose: () => void
}) {
  const moveAssigned = useBudget((s) => s.moveAssigned)
  const ref = useRef<HTMLFormElement>(null)
  const [other, setOther] = useState<string | null>(null)
  const [amountText, setAmountText] = useState(() => formatCents(target.available))

  useEffect(() => {
    const inside = (t: EventTarget | null) => ref.current?.contains(t as Node) ?? false
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Close when the page scrolls under the fixed popover, but not when a
    // picker list inside it scrolls.
    const onScroll = (e: Event) => {
      if (!inside(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  const options = useMemo<PickerOption[]>(() => {
    const groupOrder = new Map(file.categoryGroups.map((g, i) => [g.id, i]))
    const groupName = new Map(file.categoryGroups.map((g) => [g.id, g.name]))
    return [
      { key: TO_BUDGET, label: 'To budget' },
      ...file.categories
        .filter((c) => !c.hidden && c.id !== target.category.id)
        .sort((a, b) => (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0))
        .map((c) => ({ key: c.id, label: c.name, group: groupName.get(c.groupId) ?? '' })),
    ]
  }, [file.categories, file.categoryGroups, target.category.id])

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

  const { anchor } = target
  return (
    <form
      ref={ref}
      className="move-popover"
      style={{ top: anchor.bottom + 6, right: window.innerWidth - anchor.right }}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
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
  )
}
