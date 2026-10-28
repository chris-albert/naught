import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleBudget } from '../demo/sampleBudget'
import { needsCategory } from '../model/payeeRules'
import { INCOME_CATEGORY_ID, type Transaction } from '../model/types'
import { buildCategorizeRequest, readSuggestions, suggestCategories } from './categorize'
import { MODEL } from './claude'

const today = '2026-10-27'

afterEach(() => vi.unstubAllGlobals())

describe('buildCategorizeRequest', () => {
  const file = sampleBudget(today)
  const pending = file.transactions.filter(needsCategory)
  const request = buildCategorizeRequest(file, pending)

  it('asks only about rows that need a category, by number', () => {
    expect(pending.length).toBeGreaterThan(0)
    expect([...request.rows.values()]).toEqual(pending.map((t) => t.id))
    const categorized = file.transactions.find((t) => t.categoryId)!
    const transfer = file.transactions.find((t) => t.transferAccountId)!
    const { rows } = buildCategorizeRequest(file, [categorized, transfer, pending[0]])
    expect([...rows.values()]).toEqual([pending[0].id])
  })

  it('sends the categories by short key, with their group, plus Income', () => {
    const text = request.system[1].text
    expect(text).toContain('c1: Bills / Rent')
    expect(text).toContain('income: Income')
    expect(request.categories.get('c1')).toBe(file.categories[0].id)
    expect(request.categories.get('income')).toBe(INCOME_CATEGORY_ID)
    expect(text).not.toContain(file.categories[0].id)
  })

  it('puts the examples under the cache breakpoint and only the new rows in the user turn', () => {
    expect(request.system.map((b) => b.cache_control)).toEqual([undefined, undefined, { type: 'ephemeral' }])
    const examples = request.system[2].text.split('\n').slice(2)
    expect(examples.length).toBeGreaterThan(10)
    expect(examples.length).toBeLessThanOrEqual(40)
    // one example per payee, and never an uncategorized row or a transfer
    const payees = examples.map((l) => l.split(' | ')[2])
    expect(new Set(payees).size).toBe(payees.length)
    expect(payees).not.toContain(pending[0].payee)
    expect(request.system[2].text).not.toContain('Transfer :')
    expect(request.user).toContain(`1 | credit | ${pending[0].payee} | ${pending[0].memo} | `)
  })

  it('sends only payee, memo, amount and account type of a row', () => {
    const everything = [...request.system.map((b) => b.text), request.user].join('\n')
    for (const t of file.transactions) expect(everything).not.toContain(t.id)
    for (const a of file.accounts) expect(everything).not.toContain(a.name)
    expect(everything).not.toContain(file.name)
  })
})

describe('readSuggestions', () => {
  const file = sampleBudget(today)
  const pending = file.transactions.filter(needsCategory)
  const request = buildCategorizeRequest(file, pending)

  it('maps keys back to ids and drops anything it does not know', () => {
    const out = readSuggestions(
      {
        suggestions: [
          { id: 1, category: 'c1', confidence: 95, payee: ' Amazon ' },
          { id: 2, category: 'income', confidence: 140, payee: null },
          { id: 2, category: 'c2', confidence: 50, payee: null }, // second answer for a row: ignored
          { id: 99, category: 'c1', confidence: 90, payee: null }, // unknown row
          { id: 3, category: 'c999', confidence: 90, payee: null }, // unknown category
          { id: 4, category: 'c3', confidence: -5, payee: '' },
        ],
      },
      request,
    )
    expect(out).toEqual([
      { transactionId: pending[0].id, categoryId: file.categories[0].id, confidence: 95, payee: 'Amazon' },
      { transactionId: pending[1].id, categoryId: INCOME_CATEGORY_ID, confidence: 100, payee: null },
      { transactionId: pending[3].id, categoryId: file.categories[2].id, confidence: 0, payee: null },
    ])
  })
})

describe('suggestCategories', () => {
  it('sends one structured-output request at low effort and reads the answer', async () => {
    const file = sampleBudget(today)
    const pending = file.transactions.filter(needsCategory)
    const requests: { headers: Headers; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      requests.push({ headers: new Headers(init.headers), body: JSON.parse(init.body as string) })
      const text = JSON.stringify({ suggestions: [{ id: 1, category: 'c1', confidence: 91, payee: null }] })
      return Response.json({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: MODEL,
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1500, output_tokens: 300 },
      })
    })

    const out = await suggestCategories({ apiKey: 'sk-ant-test', file, transactions: pending })

    expect(requests).toHaveLength(1)
    const { headers, body } = requests[0]
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(body.model).toBe(MODEL)
    expect(body.stream).toBeUndefined()
    const config = body.output_config as { effort: string; format: { type: string; schema: { properties: Record<string, unknown> } } }
    expect(config.effort).toBe('low')
    expect(config.format.type).toBe('json_schema')
    expect(config.format.schema.properties).toHaveProperty('suggestions')
    const system = body.system as { text: string; cache_control?: unknown }[]
    expect(system).toHaveLength(3)
    expect(system[2].cache_control).toEqual({ type: 'ephemeral' })
    expect(body.messages).toEqual([{ role: 'user', content: expect.stringContaining('New transactions:') }])
    expect(out).toEqual([{ transactionId: pending[0].id, categoryId: file.categories[0].id, confidence: 91, payee: null }])
  })

  it('asks nothing when no row needs a category', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const file = sampleBudget(today)
    const categorized = file.transactions.filter((t: Transaction) => t.categoryId)
    expect(await suggestCategories({ apiKey: 'sk-ant-test', file, transactions: categorized })).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
