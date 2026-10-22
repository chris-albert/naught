import type { SyncRun } from '../model/types'
import { useBudget } from '../store/budgetStore'
import { fetchAccounts, getAccessUrl } from './client'
import { mergeSimplefin } from './sync'

/** Fetch and import for every already-linked account, no questions asked. Returns the recorded run. */
export async function quickSync(days = 30): Promise<SyncRun> {
  const accessUrl = await getAccessUrl()
  if (!accessUrl) throw new Error('SimpleFIN is not connected yet')
  const file = useBudget.getState().file
  if (!file) throw new Error('No budget open')
  const linkedIds = new Set(file.accounts.filter((a) => a.simplefinId).map((a) => a.simplefinId))
  if (linkedIds.size === 0) throw new Error('No accounts are linked yet')

  const startDate = new Date(Date.now() - days * 86_400_000)
  const result = await fetchAccounts(accessUrl, { startDate, pending: true })
  if (result.errors.length) throw new Error(result.errors.join('; '))

  let run: SyncRun | undefined
  useBudget.getState().update((current) => {
    const merged = mergeSimplefin(
      current,
      result.accounts.filter((a) => linkedIds.has(a.id)),
      { since: startDate.toISOString().slice(0, 10) },
    )
    run = merged.run
    return merged.file
  }, 'bank sync')
  return run!
}
