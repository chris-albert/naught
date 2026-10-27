import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { BudgetFile } from '../model/types'
import { apiMessage, MODEL } from './claude'
import { financeTools } from './tools'

/**
 * One question to Claude about the budget, answered with the tools in tools.ts.
 * The conversation is the caller's: it is passed in and the extended version is
 * returned, so it lives only as long as the page that holds it. Every request
 * resends the whole conversation; the system prompt and tool definitions sit
 * under a cache breakpoint and the top-level one caches the conversation so far,
 * which is what keeps the tool round trips cheap.
 */

export type ChatMessage = Anthropic.Beta.BetaMessageParam

export type ChatEvent =
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'usage'; input: number; cached: number; output: number }

export interface AskOptions {
  apiKey: string
  file: BudgetFile
  /** ISO date; what "this month" and "this year" mean. */
  today: string
  history: ChatMessage[]
  question: string
  onEvent: (event: ChatEvent) => void
  signal?: AbortSignal
}

const systemPrompt = (today: string) =>
  [
    'You are the assistant inside Naught, a personal envelope-budgeting app. You answer questions about the person\'s own finances with the tools, which run over their budget data in their browser.',
    `Today is ${today}. Months are written YYYY-MM.`,
    '',
    'Rules:',
    '- Take every number from a tool. Never guess, estimate or extrapolate a figure you have not seen; if the tools cannot answer part of a question, say so.',
    '- When a question needs several tools, call them together in one turn.',
    '- Amounts are US dollars. Tools report spending as positive money out; a negative spending figure means refunds or inflows exceeded spending.',
    '- Lead with the answer, then the figures behind it, briefly. Say which months the figures cover.',
    '- Keep it short: a few sentences or bullets. A small Markdown table only when comparing several months or categories; no headings.',
  ].join('\n')

/** Ask `question` with `history` before it; resolves to the conversation including the answer. */
export async function ask({ apiKey, file, today, history, question, onEvent, signal }: AskOptions): Promise<ChatMessage[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  const tools = financeTools(file, today).map((t) =>
    betaZodTool({ name: t.name, description: t.description, inputSchema: t.inputSchema, run: (input) => t.run(input), eager_input_streaming: true }),
  )
  const runner = client.beta.messages.toolRunner(
    {
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: systemPrompt(today), cache_control: { type: 'ephemeral' } }],
      cache_control: { type: 'ephemeral' },
      tools,
      messages: [...history, { role: 'user', content: question }],
      stream: true,
      thread: false,
      max_iterations: 8,
    },
    { signal },
  )

  try {
    for await (const stream of runner) {
      stream.on('thinking', (delta) => onEvent({ type: 'thinking', text: delta }))
      stream.on('text', (delta) => onEvent({ type: 'text', text: delta }))
      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') onEvent({ type: 'tool_call', name: block.name, input: block.input })
      })
      const message = await stream.finalMessage()
      const u = message.usage
      onEvent({ type: 'usage', input: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), cached: u.cache_read_input_tokens ?? 0, output: u.output_tokens })
      if (message.stop_reason === 'refusal') throw new Error(message.stop_details?.explanation ?? 'Claude declined to answer this one.')
      // A tool input cut off at max_tokens can still parse; do not run it.
      if (message.stop_reason === 'max_tokens' && message.content.some((b) => b.type === 'tool_use')) {
        throw new Error('The answer ran too long and was cut off. Try a narrower question.')
      }
    }
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Anthropic. Check your connection and try again.')
    if (e instanceof Anthropic.APIError) throw new Error(apiMessage(e))
    throw e
  }
  return runner.params.messages
}
