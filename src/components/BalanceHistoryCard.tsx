import { useMemo } from 'react'
import { balanceHistory } from '../model/accountBalances'
import { formatCents } from '../model/money'
import type { BudgetFile, Cents } from '../model/types'
import { BalanceLine } from './BalanceLine'

export const RANGES: [number, string][] = [
  [30, '30 days'],
  [90, '90 days'],
  [180, '6 months'],
  [365, '1 year'],
]

/** The 30-day / 90-day / … switch shared by every balance chart. */
export function RangePicker({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <div className="segmented">
      {RANGES.map(([n, label]) => (
        <button key={n} className={days === n ? 'on' : ''} onClick={() => onChange(n)}>
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * One account's balance, change, low and high over the range, with the end-of-day balance line below.
 * A credit card also shows what was charged in the range and, once the card's cash back rate is set, the estimated reward.
 */
export function BalanceHistoryStats({ file, accountId, from, to, days }: { file: BudgetFile; accountId: string; from: string; to: string; days: number }) {
  const history = useMemo(() => balanceHistory(file, accountId, from, to), [file, accountId, from, to])
  const account = file.accounts.find((a) => a.id === accountId)
  const credit = account?.type === 'credit'
  const rate = account?.cashBackRate
  return (
    <>
      <div className="stat-row">
        <Stat label="Balance" value={history.balance} />
        <Stat label={`Change · ${days} days`} value={history.change} signed />
        <Stat label="Lowest" value={history.low} />
        <Stat label="Highest" value={history.high} />
        {credit && <Stat label={`Spent · ${days} days`} value={history.spent} />}
        {credit && rate !== undefined && <Stat label={`Est. cash back · ${rate}%`} value={Math.round((history.spent * rate) / 100)} />}
      </div>
      <BalanceLine points={history.points} />
    </>
  )
}

function Stat({ label, value, signed = false }: { label: string; value: Cents; signed?: boolean }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong className={signed ? (value < 0 ? 'neg' : value > 0 ? 'pos' : '') : value < 0 ? 'neg' : ''}>
        {signed && value > 0 ? '+' : ''}
        {formatCents(value)}
      </strong>
    </div>
  )
}
