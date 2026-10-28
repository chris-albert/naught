import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { needsCategory } from '../model/payeeRules'
import { isSplit } from '../model/splits'
import type { BudgetFile, Transaction } from '../model/types'
import { samePayee } from '../simplefin/sync'
import { suggestCategories } from './categorize'

/*
 * How often Claude's suggestion matches what the person chose, measured on a
 * real budget: the category is hidden on a sample of categorized transactions
 * and the suggestions compared with the originals. Costs real money, so it only
 * runs when both of these are set:
 *
 *   NAUGHT_EVAL_FILE=~/budget.json ANTHROPIC_API_KEY=sk-ant-… pnpm test src/ai/categorize.eval
 *
 * NAUGHT_EVAL_SAMPLE sets how many transactions to hide (default 60).
 */

const FILE = process.env.NAUGHT_EVAL_FILE
const KEY = process.env.ANTHROPIC_API_KEY
const SAMPLE = Number(process.env.NAUGHT_EVAL_SAMPLE ?? 60)

describe.skipIf(!FILE || !KEY)('categorize accuracy', () => {
  it('agrees with the person most of the time', async () => {
    const file = JSON.parse(readFileSync(FILE!.replace(/^~/, process.env.HOME ?? ''), 'utf8')) as BudgetFile
    const categorized = file.transactions.filter((t) => t.categoryId && !t.transferAccountId && !isSplit(t)).sort((a, b) => (a.date < b.date ? 1 : -1))
    // Every k-th recent transaction, so the sample spans payees and months.
    const step = Math.max(1, Math.floor(categorized.length / SAMPLE))
    const sample = categorized.filter((_, i) => i % step === 0).slice(0, SAMPLE)
    const hidden = new Set(sample.map((t) => t.id))
    const blind: BudgetFile = { ...file, transactions: file.transactions.map((t) => (hidden.has(t.id) ? { ...t, categoryId: null } : t)) }
    const rows = blind.transactions.filter((t) => hidden.has(t.id) && needsCategory(t))
    const knownPayee = (t: Transaction) => blind.transactions.some((o) => o.categoryId && !o.transferAccountId && samePayee(o.payee, t.payee))

    const suggestions = await suggestCategories({ apiKey: KEY!, file: blind, transactions: rows })
    const byId = new Map(suggestions.map((s) => [s.transactionId, s]))
    const name = (id: string | null) => file.categories.find((c) => c.id === id)?.name ?? id
    const score = (set: Transaction[]) => {
      const answered = set.filter((t) => byId.has(t.id))
      const right = answered.filter((t) => byId.get(t.id)!.categoryId === t.categoryId)
      return { n: set.length, answered: answered.length, right: right.length, pct: answered.length ? Math.round((100 * right.length) / answered.length) : 0 }
    }
    const all = score(rows)
    const first = score(rows.filter((t) => !knownPayee(t)))
    const confident = score(rows.filter((t) => (byId.get(t.id)?.confidence ?? 0) >= 90))

    console.log(`all: ${all.right}/${all.answered} right (${all.pct}%), ${all.n - all.answered} unanswered`)
    console.log(`first-time payees: ${first.right}/${first.answered} right (${first.pct}%)`)
    console.log(`at 90%+ confidence: ${confident.right}/${confident.answered} right (${confident.pct}%)`)
    for (const t of rows) {
      const s = byId.get(t.id)
      if (s && s.categoryId !== t.categoryId) console.log(`  miss: ${t.payee} ${t.amount / 100} → ${name(s.categoryId)} ${s.confidence}% (was ${name(t.categoryId)})`)
    }

    expect(all.pct).toBeGreaterThan(50)
  }, 180_000)
})
