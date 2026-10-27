import { z } from 'zod'
import { accountBalance, computeMonth } from '../model/budgetMath'
import { addMonths, formatMonth, monthOf, shortMonth } from '../model/dates'
import { recurringPayees } from '../model/insights'
import { dayOf } from '../model/ledger'
import { formatCents } from '../model/money'
import { buildMonthReview } from '../model/monthReview'
import { netWorthHistory } from '../model/netWorth'
import { buildReport, monthRange } from '../model/reports'
import { linesOf } from '../model/splits'
import { INCOME_CATEGORY_ID, type BudgetFile, type Cents, type MonthKey, type Transaction } from '../model/types'

/**
 * The tools the Ask page gives Claude: thin wrappers over the report functions
 * in src/model, each returning a compact text table. Everything a tool returns
 * is sent to Anthropic as part of the conversation, so the output is kept to
 * aggregates and short transaction lists. Nothing here changes the budget.
 */

export interface FinanceTool {
  name: string
  description: string
  inputSchema: z.ZodType
  run: (input: unknown) => string
}

function tool<S extends z.ZodType>(name: string, description: string, inputSchema: S, run: (input: z.infer<S>) => string): FinanceTool {
  return { name, description, inputSchema, run: (input) => run(input as z.infer<S>) }
}

const MAX_MONTHS = 24
const MAX_ROWS = 50

const month = z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM')
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

const $ = formatCents
const pct = (r: number | null) => (r === null ? 'n/a' : `${Math.round(r * 100)}%`)
const signed = (c: Cents) => (c > 0 ? `+${$(c)}` : $(c))

/** Rows joined with " | ", one per line, no padding: the cheapest table that still reads as one. */
function table(header: string[], rows: (string | number)[][]): string {
  return [header.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n')
}

/** Every month from `from` to `to`, newest last, trimmed to the last MAX_MONTHS. */
function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  if (from > to) [from, to] = [to, from]
  const out: MonthKey[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out.slice(-MAX_MONTHS)
}

export function financeTools(file: BudgetFile, today: string): FinanceTool[] {
  const thisMonth = monthOf(today)
  const categoryName = new Map(file.categories.map((c) => [c.id, c.name]))
  const groupName = new Map(file.categoryGroups.map((g) => [g.id, g.name]))
  const accountName = new Map(file.accounts.map((a) => [a.id, a.name]))
  const paymentCategoryIds = new Set(file.accounts.map((a) => a.paymentCategoryId).filter(Boolean))
  const nameOf = (categoryId: string | null) =>
    categoryId === null ? '(uncategorized)' : categoryId === INCOME_CATEGORY_ID ? 'Income' : categoryName.get(categoryId) ?? categoryId
  const lineCategory = (t: Transaction) => {
    if (t.transferAccountId) return `Transfer: ${accountName.get(t.transferAccountId) ?? '?'}`
    const lines = linesOf(t)
    return lines.length > 1 ? `Split: ${lines.map((l) => `${nameOf(l.categoryId)} ${$(l.amount)}`).join(', ')}` : nameOf(lines[0].categoryId)
  }
  const matches = (needle: string | undefined) => {
    const n = needle?.trim().toLowerCase()
    return (name: string) => !n || name.toLowerCase().includes(n)
  }

  return [
    tool(
      'spending_by_category',
      'Monthly income, living spending, money set aside in reserves and net, plus net spending per category and group, for a range of months (at most 24). Counts on-budget accounts only, leaves out transfers between accounts and credit card payments, and nets refunds against spending. Use this for "how much do I spend on X", averages, and comparing months.',
      z.object({ fromMonth: month.describe('First month, YYYY-MM'), toMonth: month.describe('Last month, YYYY-MM') }),
      ({ fromMonth, toMonth }) => {
        const months = monthsBetween(fromMonth, toMonth)
        const last = months[months.length - 1]
        const throughDay = last === thisMonth ? dayOf(today) : 31
        const r = buildReport(file, months, throughDay)
        const out = [
          `Spending by category, ${formatMonth(months[0])} to ${formatMonth(last)}${last === thisMonth ? ` (current month, through day ${throughDay})` : ''}.`,
          'Spending figures are net money out; a negative one means refunds or inflows exceeded spending.',
          '',
          table(
            ['Month', 'Income', 'Living spending', 'Set aside', 'Drawn from reserves', 'Net', 'Uncategorized rows'],
            r.summaries.map((s) => [s.month, $(s.income), $(s.living), $(s.setAside), $(s.drawn), $(s.net), s.uncategorized]),
          ),
          `Averages: income ${$(r.avgIncome)}, living ${$(r.avgLiving)}, set aside ${$(r.avgSetAside)}, net ${$(r.avgNet)}; savings rate ${pct(r.savingsRate)}; monthly targets add up to ${$(r.targets)}.`,
          '',
          table(
            ['Category', ...months.map(shortMonth), 'Total', 'Average'],
            r.groups.flatMap((g) => [
              [`== ${g.group.name}`, ...g.byMonth.map($), $(g.total), $(g.average)],
              ...g.categories.map((c) => [`${c.category.name}${c.category.reserve ? ' (reserve)' : ''}`, ...c.byMonth.map($), $(c.total), $(c.average)]),
            ]),
          ),
        ]
        if (r.movers.length) {
          out.push(
            '',
            `Biggest swings in ${formatMonth(last)} through day ${throughDay} versus the same days of the earlier months:`,
            table(
              ['Category', 'So far', 'Usual by now', 'Difference'],
              r.movers.map((c) => [c.category.name, $(c.soFar), $(c.soFarAverage), signed(c.deltaVsAverage)]),
            ),
          )
        }
        return out.join('\n')
      },
    ),

    tool(
      'transactions',
      `Individual transactions, newest first, filtered by payee, category or account name (case-insensitive, partial match), date range, and a minimum size. Returns at most ${MAX_ROWS} rows plus the count and total of everything that matched. Use this to find specific purchases or to see what makes up a category's spending.`,
      z.object({
        payee: z.string().optional().describe('Part of the payee name'),
        category: z.string().optional().describe('Part of the category name; "Income" for income, "Transfer" for transfers, "uncategorized" for rows without a category'),
        account: z.string().optional().describe('Part of the account name'),
        fromDate: isoDate.optional().describe('Earliest date, YYYY-MM-DD'),
        toDate: isoDate.optional().describe('Latest date, YYYY-MM-DD'),
        minAmount: z.number().optional().describe('Only rows of at least this many dollars, inflow or outflow'),
        limit: z.number().int().min(1).max(MAX_ROWS).optional().describe(`Rows to return, default 25, at most ${MAX_ROWS}`),
      }),
      ({ payee, category, account, fromDate, toDate, minAmount, limit = 25 }) => {
        const byPayee = matches(payee)
        const byAccount = matches(account)
        const byCategory = matches(category)
        const rows = file.transactions
          .filter(
            (t) =>
              byPayee(t.payee) &&
              byAccount(accountName.get(t.accountId) ?? '') &&
              byCategory(lineCategory(t)) &&
              (!fromDate || t.date >= fromDate) &&
              (!toDate || t.date <= toDate) &&
              (minAmount === undefined || Math.abs(t.amount) >= Math.round(minAmount * 100)),
          )
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        const total = rows.reduce((t, r) => t + r.amount, 0)
        const shown = rows.slice(0, limit)
        return [
          `${rows.length} matching transactions, net total ${$(total)} (outflows negative). Showing the newest ${shown.length}.`,
          table(
            ['Date', 'Account', 'Payee', 'Category', 'Amount', 'Memo'],
            shown.map((t) => [t.date, accountName.get(t.accountId) ?? '?', t.payee, lineCategory(t), $(t.amount), t.memo]),
          ),
        ].join('\n')
      },
    ),

    tool(
      'recurring_payees',
      'Subscriptions and bills: payees that charge monthly or yearly, with the usual amount, what each costs per month, how many charges, first and last charge, whether it is active, new (started in the last two months) or stopped, and any recent price change. Use this for "what subscriptions do I have", "what started or stopped", and fixed monthly costs.',
      z.object({}),
      () => {
        const r = recurringPayees(file, today)
        return [
          `${r.count} recurring payees as of ${today}; stable ones still charging add up to ${$(r.fixedMonthly)} per month.`,
          table(
            ['Payee', 'Category', 'Cadence', 'Usual amount', 'Monthly cost', 'Charges', 'First', 'Last', 'Status', 'Note'],
            r.payees.map((p) => [
              p.payee,
              nameOf(p.categoryId),
              p.cadence,
              $(p.amount),
              $(p.monthlyCost),
              p.count,
              p.firstDate,
              p.lastDate,
              p.status,
              [
                p.priceChange && `price ${$(p.priceChange.from)} to ${$(p.priceChange.to)} since ${p.priceChange.since}`,
                p.nextDate && `next due ${p.nextDate}`,
                !p.stable && 'amount varies',
              ]
                .filter(Boolean)
                .join('; '),
            ]),
          ),
        ].join('\n')
      },
    ),

    tool(
      'month_review',
      'One month in review: income, living spending, set aside and net against the month before and the average of the earlier months; for the current month, how spending is pacing and where it is heading; overspent categories; usual spending that has not shown up yet; and the five largest outflows. Use this for "how is this month going" or "why was October high".',
      z.object({ month: month.optional().describe('YYYY-MM; defaults to the current month') }),
      ({ month: m = thisMonth }) => {
        const r = buildMonthReview(file, m, today)
        const headline = (label: string, h: { value: Cents; vsPrev: Cents; vsAverage: Cents }) =>
          `${label}: ${$(h.value)} (${signed(h.vsPrev)} vs ${formatMonth(r.prevMonth)}, ${signed(h.vsAverage)} vs average)`
        const points = (p: number | null) => (p === null ? 'n/a' : `${p >= 0 ? '+' : ''}${Math.round(p * 100)} pts`)
        const out = [
          `${formatMonth(m)} in review${r.current ? ` (current month, through day ${r.throughDay})` : ''}, compared with ${r.comparedMonths} earlier months.`,
          headline('Income', r.income),
          headline('Living spending', r.living),
          headline('Set aside in reserves', r.setAside),
          headline('Net', r.net),
          `Savings rate: ${pct(r.savingsRate.value)} (${points(r.savingsRate.vsPrev)} vs previous month, ${points(r.savingsRate.vsAverage)} vs average)`,
        ]
        if (r.pace) {
          const p = r.pace
          out.push(
            '',
            `Pace with ${p.daysLeft} days left: spent ${$(p.soFar)} so far vs ${$(p.usualByNow)} usual by this day; run rate ${$(p.runRate)}; projected ${$(p.projected)} vs ${$(p.averageMonth)} average month; ${$(p.available)} still available in the budget.`,
            table(
              ['Group / category', 'So far', 'Usual by now', 'Projected', 'Average month', 'Available'],
              p.groups.flatMap((g) => [
                [`== ${g.group.name}`, $(g.soFar), $(g.usualByNow), $(g.projected), $(g.averageMonth), $(g.available)],
                ...g.categories.map((c) => [c.category.name, $(c.soFar), $(c.usualByNow), $(c.projected), $(c.averageMonth), $(c.available)]),
              ]),
            ),
          )
        }
        out.push('', `Budget: ${$(r.budget.assigned)} assigned, ${$(r.budget.spent)} spent.`)
        if (r.budget.overspent.length) out.push(`Overspent: ${r.budget.overspent.map((b) => `${b.category.name} (${$(b.available)} available)`).join(', ')}`)
        if (r.missing.length) out.push(`Usual spending not seen yet: ${r.missing.map((x) => `${x.category.name} (usually ${$(x.usual)} by now)`).join(', ')}`)
        if (r.largest.length) {
          out.push('', 'Largest outflows:', table(['Date', 'Payee', 'Category', 'Amount'], r.largest.map((t) => [t.date, t.payee, nameOf(t.categoryId), $(t.amount)])))
        }
        return out.join('\n')
      },
    ),

    tool(
      'net_worth',
      'Month-end balance of every account (on-budget and off, open and closed) over the last N months, with assets, debts and net worth per month. Use this for "what is my net worth", how it changed, and account balances over time.',
      z.object({ months: z.number().int().min(1).max(36).optional().describe('How many months back from the current one, default 12') }),
      ({ months: n = 12 }) => {
        const months = monthRange(thisMonth, n)
        const r = netWorthHistory(file, months)
        const first = months[0]
        return [
          `Net worth ${$(r.net)} at the end of ${formatMonth(thisMonth)}: ${signed(r.change)} since ${formatMonth(first)}, ${signed(r.changeLastMonth)} over the last month.${r.firstMonth ? ` Oldest transaction: ${r.firstMonth}.` : ''}`,
          table(
            ['Month', 'Assets', 'Debts', 'Net worth', 'On budget', 'Off budget'],
            r.summaries.map((s) => [s.month, $(s.assets), $(s.debts), $(s.net), $(s.onBudget), $(s.offBudget)]),
          ),
          '',
          table(
            ['Account', 'Budget', `End of ${shortMonth(first)}`, `End of ${shortMonth(thisMonth)}`, 'Change'],
            r.accounts.map((a) => {
              const start = a.byMonth[0]
              const end = a.byMonth[a.byMonth.length - 1]
              return [`${a.account.name}${a.account.closed ? ' (closed)' : ''}`, a.account.onBudget ? 'on' : 'off', $(start), $(end), signed(end - start)]
            }),
          ),
        ].join('\n')
      },
    ),

    tool(
      'budget_month',
      'The envelope budget for one month: money to budget, income, and per category what was assigned, the activity (spending negative, inflows positive) and what is available. Use this for "how much is left in X", "what did I assign", and overspending.',
      z.object({ month: month.optional().describe('YYYY-MM; defaults to the current month') }),
      ({ month: m = thisMonth }) => {
        const b = computeMonth(file, m, thisMonth)
        return [
          `Budget for ${formatMonth(m)}: ${$(b.toBudget)} to budget, ${$(b.income)} income, ${$(b.totalAssigned)} assigned.`,
          table(
            ['Group / category', 'Assigned', 'Activity', 'Available'],
            b.groups.flatMap((g) => [
              [`== ${g.group.name}`, $(g.assigned), $(g.activity), $(g.available)],
              ...g.rows.map((r) => [r.category.name, $(r.assigned), $(r.activity), $(r.available)]),
            ]),
          ),
        ].join('\n')
      },
    ),

    tool(
      'categories',
      'Every category with its group, whether it is a living or reserve (savings) category, its monthly target, and whether it is hidden. Use this to learn the exact category names before filtering transactions.',
      z.object({}),
      () =>
        table(
          ['Category', 'Group', 'Kind', 'Monthly target', 'Hidden'],
          file.categories.map((c) => [
            c.name,
            groupName.get(c.groupId) ?? '?',
            paymentCategoryIds.has(c.id) ? 'credit card payment' : c.reserve ? 'reserve' : 'living',
            c.target === undefined ? '' : $(c.target),
            c.hidden ? 'yes' : '',
          ]),
        ),
    ),

    tool(
      'accounts',
      'Every account with its type, whether it is on budget, whether it is closed, its current balance, and the balance the bank last reported.',
      z.object({}),
      () =>
        table(
          ['Account', 'Type', 'Budget', 'Status', 'Balance', 'Bank balance'],
          file.accounts.map((a) => [
            a.name,
            a.type,
            a.onBudget ? 'on' : 'off',
            a.closed ? 'closed' : 'open',
            $(accountBalance(file, a.id)),
            a.bankBalance === undefined ? '' : `${$(a.bankBalance)}${a.bankBalanceDate ? ` on ${a.bankBalanceDate}` : ''}`,
          ]),
        ),
    ),
  ]
}
