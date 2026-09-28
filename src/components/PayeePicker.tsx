import { forwardRef } from 'react'
import { Picker, type PickerHandle, type PickerOption } from './Picker'

export const PayeePicker = forwardRef<PickerHandle, { payees: PickerOption[]; value: string; onChange: (payee: string) => void }>(
  function PayeePicker({ payees, value, onChange }, ref) {
    return <Picker ref={ref} options={payees} value={value} placeholder="Payee" allowCustom onChange={onChange} />
  },
)
