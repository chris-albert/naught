import type { PickerOption } from './Picker'
import { Picker } from './Picker'

export function PayeePicker({
  payees,
  value,
  onChange,
}: {
  payees: PickerOption[]
  value: string
  onChange: (payee: string) => void
}) {
  return <Picker options={payees} value={value} placeholder="Payee" allowCustom onChange={onChange} />
}
