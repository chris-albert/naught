import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleBudget } from '../demo/sampleBudget'
import { ask, type ChatEvent } from './chat'
import { MODEL } from './claude'

/*
 * The API is stubbed at fetch: the first reply calls the `accounts` tool, the
 * second answers in text. This checks what leaves the page (the request shape
 * the issue asks for) and that the tool loop runs here and comes back as one
 * conversation, without spending anything.
 */

const today = '2026-10-27'

function sse(events: object[]): Response {
  const body = events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const start = (cacheRead: number) => ({
  type: 'message_start',
  message: {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: cacheRead },
  },
})
const stop = (reason: string) => [
  { type: 'message_delta', delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 20 } },
  { type: 'message_stop' },
]

const toolCallReply = sse([
  start(0),
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Need the accounts.' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'accounts', input: {} } },
  { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{}' } },
  { type: 'content_block_stop', index: 1 },
  ...stop('tool_use'),
])
const textReply = sse([
  start(2000),
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'You have three accounts.' } },
  { type: 'content_block_stop', index: 0 },
  ...stop('end_turn'),
])

afterEach(() => vi.unstubAllGlobals())

describe('ask', () => {
  it('runs the tool loop in the page and returns the whole conversation', async () => {
    const requests: { headers: Headers; body: Record<string, unknown> }[] = []
    const replies = [toolCallReply, textReply]
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      requests.push({ headers: new Headers(init.headers), body: JSON.parse(init.body as string) })
      return replies.shift()!
    })

    const events: ChatEvent[] = []
    const history = await ask({ apiKey: 'sk-ant-test', file: sampleBudget(today), today, history: [], question: 'How many accounts do I have?', onEvent: (e) => events.push(e) })

    expect(requests).toHaveLength(2)
    const first = requests[0].body
    expect(requests[0].headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(first.model).toBe(MODEL)
    expect(first.stream).toBe(true)
    expect(first.thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect(first.output_config).toEqual({ effort: 'medium' })
    expect(first.cache_control).toEqual({ type: 'ephemeral' })
    expect(first.system).toEqual([{ type: 'text', text: expect.stringContaining(`Today is ${today}`), cache_control: { type: 'ephemeral' } }])
    expect(first.thread).toBeUndefined()
    const tools = first.tools as { name: string; input_schema: { type: string }; eager_input_streaming: boolean }[]
    expect(tools.map((t) => t.name)).toEqual(['spending_by_category', 'transactions', 'recurring_payees', 'month_review', 'net_worth', 'budget_month', 'categories', 'accounts'])
    expect(tools.every((t) => t.input_schema.type === 'object' && t.eager_input_streaming)).toBe(true)
    expect(first.messages).toEqual([{ role: 'user', content: 'How many accounts do I have?' }])

    // The second request resends everything, with the tool's table as the result.
    const second = requests[1].body.messages as { role: string; content: unknown }[]
    expect(second).toHaveLength(3)
    expect(second[1].role).toBe('assistant')
    const result = (second[2].content as { type: string; tool_use_id: string; content: string }[])[0]
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' })
    expect(result.content).toContain('Checking | checking | on | open | ')
    expect(requests[1].body.system).toEqual(first.system)

    expect(events).toEqual([
      { type: 'thinking', text: 'Need the accounts.' },
      { type: 'tool_call', name: 'accounts', input: {} },
      { type: 'usage', input: 100, cached: 0, output: 20 },
      { type: 'text', text: 'You have three accounts.' },
      { type: 'usage', input: 2100, cached: 2000, output: 20 },
    ])

    expect(history.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(history[3].content).toEqual([{ type: 'text', text: 'You have three accounts.' }])
  })
})
