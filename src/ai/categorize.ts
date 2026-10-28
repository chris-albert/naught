import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { formatCents } from '../model/money'
import { needsCategory } from '../model/payeeRules'
import { isSplit } from '../model/splits'
import { INCOME_CATEGORY_ID, type BudgetFile, type Transaction } from '../model/types'
import { samePayee } from '../simplefin/sync'
import { apiMessage, MODEL } from './claude'

/**
 * Ask Claude which category each uncategorized transaction belongs in. The
 * answer is a list of suggestions the person accepts or ignores; nothing here
 * changes the budget.
 *
 * What leaves the page: the payee, memo, amount and account type of each row
 * asked about, the category names (with their group), and some of the person's
 * own past categorized transactions as examples. Categories and transactions
 * are referred to by short keys so no ids travel and the answer cannot name a
 * category that does not exist. The instructions, category list and examples
 * sit under a cache breakpoint, so a second batch within a few minutes pays
 * only for its own rows.
 */

export interface CategorySuggestion {
  transactionId: string
  categoryId: string
  /** 0–100; 90 and up is "accept all" territory. */
  confidence: number
  /** A cleaner payee name ("AMZN Mktp US*2K3J" → "Amazon"), or null when the bank's is fine. */
  payee: string | null
}

/** Rows asked about in one request. */
export const MAX_ROWS = 100
/** How many of the person's past categorized transactions go along as examples. */
const EXAMPLES = 40
/** Past transactions from each row's own payee, on top of the examples: enough to show a payee that is filed in several categories. */
const RELATED_PER_ROW = 5
const MAX_RELATED = 80

const Output = z.object({
  suggestions: z.array(
    z.object({
      id: z.number().int(),
      category: z.string(),
      confidence: z.number().int(),
      payee: z.string().nullable(),
    }),
  ),
})

const RULES = [
  'You categorize bank transactions for a personal envelope budget. For each new transaction, pick the one category from the list the person would choose themselves.',
  '',
  'Go by the person\'s own past choices first: the examples show how they categorize, and a past transaction from the same payee nearly always has the right category. Otherwise go by the payee and memo. Pay from an employer, interest and other money in that is not a refund of spending is Income; a refund belongs in the category the spending came from.',
  '',
  'Confidence is 0 to 100. Give 90 or more only when every past transaction from the same payee is in that category, or the payee is unmistakable (a grocery chain under a groceries category). When the person has put the same payee in more than one category (Amazon, Target, a card payment), their choice depends on the purchase, not the payee: pick the most frequent category and give 60 or less. Give 50 or less when you are guessing between categories.',
  '',
  'Also give a clean payee name when the bank\'s text is noisy: the merchant as a person would write it, without store numbers, card or reference suffixes, processor prefixes (SQ *, TST*, PP*, PAYPAL *) or city codes. "AMZN Mktp US*2K3J" is "Amazon", "SQ *BLUE BOTTLE 4421" is "Blue Bottle". Use the spelling the examples use for the same merchant. Return null when the payee is already clean.',
  '',
  'Return exactly one suggestion per id.',
].join('\n')

interface Row {
  type: string
  payee: string
  memo: string
  amount: string
}

const row = (file: BudgetFile, t: Transaction): Row => ({
  type: file.accounts.find((a) => a.id === t.accountId)?.type ?? 'other',
  payee: t.payee,
  memo: t.memo,
  amount: formatCents(t.amount),
})

/** Rows joined with " | ", one per line: the cheapest table that still reads as one. */
const table = (header: string[], rows: (string | number)[][]) => [header.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n')

export interface CategorizeRequest {
  system: Anthropic.TextBlockParam[]
  user: string
  /** Short key → category id, for reading the answer. */
  categories: Map<string, string>
  /** Row number → transaction id. */
  rows: Map<number, string>
}

/** The request for `transactions` (only those that still need a category), as text; pure, for tests. */
export function buildCategorizeRequest(file: BudgetFile, transactions: Transaction[]): CategorizeRequest {
  const groupName = new Map(file.categoryGroups.map((g) => [g.id, g.name]))
  const categories = new Map<string, string>()
  const keyOf = new Map<string, string>()
  const categoryLines: string[] = []
  file.categories
    .filter((c) => !c.hidden)
    .forEach((c, i) => {
      const key = `c${i + 1}`
      categories.set(key, c.id)
      keyOf.set(c.id, key)
      categoryLines.push(`${key}: ${groupName.get(c.groupId) ?? '?'} / ${c.name}`)
    })
  categories.set('income', INCOME_CATEGORY_ID)
  keyOf.set(INCOME_CATEGORY_ID, 'income')
  categoryLines.push('income: Income (pay, interest, money in that is not a refund)')

  // Past choices: the most recent categorized transaction per payee, newest first.
  const past = file.transactions
    .filter((t) => t.categoryId && !t.transferAccountId && !isSplit(t) && keyOf.has(t.categoryId))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const seenPayee = new Set<string>()
  const examples: Transaction[] = []
  for (const t of past) {
    const k = t.payee.trim().toUpperCase()
    if (!k || seenPayee.has(k)) continue
    seenPayee.add(k)
    examples.push(t)
    if (examples.length >= EXAMPLES) break
  }
  const exampleHeader = ['date', 'account type', 'payee', 'memo', 'amount', 'category']
  const exampleRow = (t: Transaction) => {
    const r = row(file, t)
    return [t.date, r.type, r.payee, r.memo, r.amount, keyOf.get(t.categoryId!)!]
  }

  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: RULES },
    { type: 'text', text: `Categories (key: group / name):\n${categoryLines.join('\n')}` },
    {
      type: 'text',
      text: examples.length ? `The person's past choices:\n${table(exampleHeader, examples.map(exampleRow))}` : 'The person has not categorized anything yet.',
      cache_control: { type: 'ephemeral' },
    },
  ]

  const rows = new Map<number, string>()
  const asked = transactions.filter(needsCategory).slice(0, MAX_ROWS)
  const rowLines = asked.map((t, i) => {
    rows.set(i + 1, t.id)
    const r = row(file, t)
    return [i + 1, r.type, r.payee, r.memo, r.amount]
  })
  // Past transactions from the same payees, beyond what the examples already show.
  const inExamples = new Set(examples.map((t) => t.id))
  const related: Transaction[] = []
  for (const t of asked) {
    let n = 0
    for (const p of past) {
      if (related.length >= MAX_RELATED) break
      if (n >= RELATED_PER_ROW) break
      if (inExamples.has(p.id) || related.includes(p) || !samePayee(p.payee, t.payee)) continue
      related.push(p)
      n++
    }
  }
  const user = [
    `New transactions:\n${table(['id', 'account type', 'payee', 'memo', 'amount'], rowLines)}`,
    related.length ? `Past transactions from the same payees:\n${table(exampleHeader, related.map(exampleRow))}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return { system, user, categories, rows }
}

/** Turn Claude's answer into suggestions, dropping anything that names an unknown row or category. */
export function readSuggestions(output: z.infer<typeof Output>, request: CategorizeRequest): CategorySuggestion[] {
  const out: CategorySuggestion[] = []
  const seen = new Set<string>()
  for (const s of output.suggestions) {
    const transactionId = request.rows.get(s.id)
    const categoryId = request.categories.get(s.category)
    if (!transactionId || !categoryId || seen.has(transactionId)) continue
    seen.add(transactionId)
    const payee = s.payee?.trim() || null
    out.push({ transactionId, categoryId, confidence: Math.max(0, Math.min(100, Math.round(s.confidence))), payee })
  }
  return out
}

export interface SuggestOptions {
  apiKey: string
  file: BudgetFile
  /** Rows to ask about; ones that already have a category, transfers and splits are left out. */
  transactions: Transaction[]
  signal?: AbortSignal
}

/** Ask Claude for a category for each of `transactions`. Throws with a short message when the request fails. */
export async function suggestCategories({ apiKey, file, transactions, signal }: SuggestOptions): Promise<CategorySuggestion[]> {
  const request = buildCategorizeRequest(file, transactions)
  if (request.rows.size === 0) return []
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 })
  let message
  try {
    message = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'low', format: zodOutputFormat(Output) },
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
      },
      { signal },
    )
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Anthropic. Check your connection and try again.')
    if (e instanceof Anthropic.APIError) throw new Error(apiMessage(e))
    throw e
  }
  if (message.stop_reason === 'refusal') throw new Error(message.stop_details?.explanation ?? 'Claude declined to answer this one.')
  if (message.stop_reason === 'max_tokens' || !message.parsed_output) throw new Error('The answer was cut off. Try again, or with fewer transactions.')
  return readSuggestions(message.parsed_output, request)
}
