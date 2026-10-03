import { forwardRef, useMemo } from 'react'
import type { BudgetFile } from '../model/types'
import { INCOME_CATEGORY_ID } from '../model/types'
import { Picker, type PickerHandle, type PickerOption } from './Picker'

const NONE = ''

export const CategoryPicker = forwardRef<
  PickerHandle,
  { file: BudgetFile; value: string | null; onChange: (categoryId: string | null) => void }
>(function CategoryPicker({ file, value, onChange }, ref) {
  const options = useMemo<PickerOption[]>(() => {
    const groupName = new Map(file.categoryGroups.map((g) => [g.id, g.name]))
    const payment = new Set(file.accounts.map((a) => a.paymentCategoryId))
    return [
      { key: NONE, label: 'Uncategorized' },
      { key: INCOME_CATEGORY_ID, label: 'Income' },
      ...file.categories
        .filter((c) => (!c.hidden && !payment.has(c.id)) || c.id === value)
        .map((c) => ({ key: c.id, label: c.name, group: groupName.get(c.groupId) ?? '' })),
    ]
  }, [file.categories, file.categoryGroups, value])

  return (
    <Picker
      ref={ref}
      options={options}
      value={value ?? NONE}
      buttonClassName={value ? '' : 'needs-category'}
      onChange={(key) => onChange(key === NONE ? null : key)}
    />
  )
})
