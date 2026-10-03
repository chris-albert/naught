import { forwardRef, useMemo } from 'react'
import { transferPayee } from '../model/transfers'
import type { BudgetFile } from '../model/types'
import { Picker, type PickerHandle, type PickerOption } from './Picker'

/**
 * Payee choices: a "Transfer: <account>" entry per open account, then every
 * payee used so far. Transfer rows are left out of the payee names; their
 * label comes from the account, so a renamed account shows its new name.
 */
export function usePayeeOptions(file: BudgetFile) {
  return useMemo(() => {
    const byLabel = new Map<string, string>() // transfer label -> account id
    const byAccount = new Map<string, string>() // account id -> transfer label
    for (const a of file.accounts) {
      const label = transferPayee(a)
      byLabel.set(label, a.id)
      byAccount.set(a.id, label)
    }
    const names = new Set<string>()
    for (const t of file.transactions) if (t.payee && !t.transferAccountId && !byLabel.has(t.payee)) names.add(t.payee)
    const options: PickerOption[] = [
      ...file.accounts.filter((a) => !a.closed).map((a) => ({ key: byAccount.get(a.id)!, label: byAccount.get(a.id)!, group: 'Transfers', accountId: a.id })),
      ...[...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ key: name, label: name, group: 'Payees' })),
    ]
    return {
      options,
      /** The account a chosen payee transfers to, if it is a transfer entry. */
      transferTo: (payee: string) => byLabel.get(payee) ?? null,
      transferLabel: (accountId: string) => byAccount.get(accountId) ?? 'Transfer',
    }
  }, [file.accounts, file.transactions])
}

export const PayeePicker = forwardRef<
  PickerHandle,
  {
    payees: (PickerOption & { accountId?: string })[]
    /** The row's own account: no transfer to itself. */
    exceptAccountId?: string
    value: string
    onChange: (payee: string) => void
  }
>(function PayeePicker({ payees, exceptAccountId, value, onChange }, ref) {
  const options = useMemo(() => payees.filter((o) => o.accountId !== exceptAccountId), [payees, exceptAccountId])
  return <Picker ref={ref} options={options} value={value} placeholder="Payee" allowCustom onChange={onChange} />
})
