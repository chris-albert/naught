import { useMemo } from 'react'
import type { BudgetFile } from '../model/types'
import { INCOME_CATEGORY_ID } from '../model/types'
import { Picker, type PickerOption } from './Picker'

const NONE = ''

export function CategoryPicker({
  file,
  value,
  onChange,
}: {
  file: BudgetFile
  value: string | null
  onChange: (categoryId: string | null) => void
}) {
  const options = useMemo<PickerOption[]>(() => {
    const groupName = new Map(file.categoryGroups.map((g) => [g.id, g.name]))
    return [
      { key: NONE, label: 'Uncategorized' },
      { key: INCOME_CATEGORY_ID, label: 'Income' },
      ...file.categories
        .filter((c) => !c.hidden || c.id === value)
        .map((c) => ({ key: c.id, label: c.name, group: groupName.get(c.groupId) ?? '' })),
    ]
  }, [file.categories, file.categoryGroups, value])

  return (
    <Picker
      options={options}
      value={value ?? NONE}
      buttonClassName={value ? '' : 'needs-category'}
      onChange={(key) => onChange(key === NONE ? null : key)}
    />
  )
}
