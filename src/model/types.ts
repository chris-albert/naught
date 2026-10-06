/** All money is stored as integer cents. */
export type Cents = number

/** Calendar month key, e.g. "2026-09". */
export type MonthKey = string

export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'other'

export interface Account {
  id: string
  name: string
  type: AccountType
  /** Off-budget accounts (investments, loans) are tracked but never affect envelopes. */
  onBudget: boolean
  closed: boolean
  /** SimpleFIN account id when this account is linked for bank sync. */
  simplefinId?: string
  /** Balance the bank reported at the last sync, and when. */
  bankBalance?: Cents
  bankBalanceDate?: string
  /** The bank's "available" balance at the last sync, when it reports one. */
  bankAvailable?: Cents
  /** Sum of transactions the bank listed as pending at the last sync. Imported as uncleared rows. */
  bankPending?: Cents
  /** For credit accounts: the category that holds cash set aside to pay the card. */
  paymentCategoryId?: string
  /** The bank's website, shown as a link on the account page. */
  bankUrl?: string
}

export interface CategoryGroup {
  id: string
  name: string
  hidden: boolean
}

export interface Category {
  id: string
  groupId: string
  name: string
  hidden: boolean
  /** Savings-style category (vacation fund, buffer, investments). Reports treat money assigned here as set aside, and spending from it as a draw rather than living expense. */
  reserve?: boolean
  /** Amount to assign every month. Absent means no target. */
  target?: Cents
}

/** One line of a split transaction. */
export interface Split {
  /** null while the line still needs a category; INCOME_CATEGORY_ID for income */
  categoryId: string | null
  /** Signed like the transaction's amount. */
  amount: Cents
}

export type ClearedState = 'uncleared' | 'cleared' | 'reconciled'

export interface Transaction {
  id: string
  accountId: string
  /** ISO date, YYYY-MM-DD */
  date: string
  payee: string
  /** null for transfers and uncategorized; INCOME_CATEGORY_ID for income */
  categoryId: string | null
  memo: string
  /** Signed: outflows negative, inflows positive. */
  amount: Cents
  /** When present, the amount is divided across these lines and `categoryId` is null (see splits.ts). Transfers are never split. */
  splits?: Split[]
  cleared: ClearedState
  /** Set when this transaction is one side of a transfer. */
  transferAccountId: string | null
  /** Bank-provided id, e.g. "sfin:<id>", used to de-duplicate imports. */
  importId?: string
  /** Payee as the bank sent it, kept so a renamed payee does not break matching a pending row to its posted one. */
  importPayee?: string
}

/** Virtual category id for income ("Ready to Assign" in YNAB). */
export const INCOME_CATEGORY_ID = 'income'

/** Name of the group that holds one payment category per credit card. */
export const CREDIT_CARD_PAYMENTS_GROUP = 'Credit Card Payments'

export interface BudgetFile {
  version: 1
  name: string
  accounts: Account[]
  categoryGroups: CategoryGroup[]
  categories: Category[]
  transactions: Transaction[]
  /** assigned[month][categoryId] = cents assigned that month */
  assigned: Record<MonthKey, Record<string, Cents>>
  /** ISO timestamp of the last successful SimpleFIN import. */
  simplefinLastSync?: string
  /** payeeRules[payee] = category to give uncategorized transactions from that payee. */
  payeeRules?: Record<string, string>
  /** Import ids of bank transactions the user deleted; sync does not bring them back. */
  ignoredImportIds?: string[]
}

export function emptyBudget(name: string): BudgetFile {
  return {
    version: 1,
    name,
    accounts: [],
    categoryGroups: [],
    categories: [],
    transactions: [],
    assigned: {},
  }
}
