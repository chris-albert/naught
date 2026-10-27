import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApiKey } from '../ai/apiKey'
import type { ChatMessage } from '../ai/chat'
import { Markdown } from '../components/Markdown'
import { currentDate } from '../model/dates'
import { useBudget } from '../store/budgetStore'

const EXAMPLES = ['Why was last month high?', 'What do I average on eating out this year?', 'Which subscriptions started this year?', 'How is this month pacing against usual?']

interface ToolCall {
  name: string
  input: unknown
}

/** One question and what came back for it, as shown on the page. */
interface Turn {
  question: string
  thinking: string
  tools: ToolCall[]
  answer: string
  error?: string
  usage: { input: number; cached: number; output: number }
}

/** Ask: a chat with Claude where every answer comes from the report functions, run here on the open budget. */
export function AskPage() {
  const file = useBudget((s) => s.file)!
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // The API conversation, with every tool call and result: in memory only, gone when the page unmounts.
  const history = useRef<ChatMessage[]>([])
  const abort = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getApiKey().then((key) => setApiKey(key ?? null))
  }, [])
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  const patchLast = (fn: (t: Turn) => Turn) => setTurns((ts) => [...ts.slice(0, -1), fn(ts[ts.length - 1])])

  const send = async (question: string) => {
    const q = question.trim()
    if (!q || busy || !apiKey) return
    setDraft('')
    setBusy(true)
    setTurns((ts) => [...ts, { question: q, thinking: '', tools: [], answer: '', usage: { input: 0, cached: 0, output: 0 } }])
    const controller = new AbortController()
    abort.current = controller
    try {
      // The Anthropic SDK is only loaded once someone asks, so the rest of the app does not carry it.
      const { ask } = await import('../ai/chat')
      history.current = await ask({
        apiKey,
        file,
        today: currentDate(),
        history: history.current,
        question: q,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === 'thinking') patchLast((t) => ({ ...t, thinking: t.thinking + e.text }))
          else if (e.type === 'text') patchLast((t) => ({ ...t, answer: t.answer + e.text }))
          else if (e.type === 'tool_call') patchLast((t) => ({ ...t, tools: [...t.tools, { name: e.name, input: e.input }] }))
          else patchLast((t) => ({ ...t, usage: { input: t.usage.input + e.input, cached: t.usage.cached + e.cached, output: t.usage.output + e.output } }))
        },
      })
    } catch (e) {
      // A stopped question is dropped from the conversation so the next one starts clean.
      patchLast((t) => ({ ...t, error: controller.signal.aborted ? 'Stopped.' : (e as Error).message }))
    } finally {
      abort.current = null
      setBusy(false)
    }
  }

  const reset = () => {
    abort.current?.abort()
    history.current = []
    setTurns([])
  }

  return (
    <>
      <header className="page-header">
        <h2>Ask</h2>
        <span className="muted">Questions about your finances, answered by Claude from the same numbers as the reports.</span>
        {turns.length > 0 && (
          <button className="secondary" style={{ marginLeft: 'auto' }} onClick={reset}>
            New conversation
          </button>
        )}
      </header>
      <div className="page-body ask">
        <p className="small muted ask-note">
          What leaves your browser: your questions, and the figures and transaction rows the tools below return, sent to Anthropic with your API key.
          The conversation is kept in memory only and is gone when you leave this page.
        </p>
        {apiKey === null && (
          <section className="card">
            <p>
              Add your Anthropic API key under <Link to="/app/settings/ai">Settings → AI</Link> to ask questions.
            </p>
          </section>
        )}
        {turns.length === 0 && apiKey && (
          <div className="ask-examples">
            {EXAMPLES.map((q) => (
              <button key={q} className="secondary" onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <TurnView key={i} turn={t} streaming={busy && i === turns.length - 1} />
        ))}
        <div ref={bottom} />
      </div>
      {apiKey && (
        <form
          className="ask-composer"
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
        >
          <textarea
            rows={2}
            placeholder="Ask about your spending, subscriptions, budget or net worth…"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(draft)
              }
            }}
          />
          {busy ? (
            <button type="button" className="secondary" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()}>
              Ask
            </button>
          )}
        </form>
      )}
    </>
  )
}

function TurnView({ turn, streaming }: { turn: Turn; streaming: boolean }) {
  const waiting = streaming && !turn.answer
  return (
    <div className="ask-turn">
      <div className="ask-question">{turn.question}</div>
      <div className="ask-answer">
        {turn.thinking && (
          <details className="ask-thinking" open={waiting}>
            <summary className="small muted">{waiting ? 'Thinking…' : 'Thought'}</summary>
            <p className="small muted">{turn.thinking}</p>
          </details>
        )}
        {turn.tools.length > 0 && (
          <div className="ask-tools">
            {turn.tools.map((c, i) => (
              <code key={i} title={JSON.stringify(c.input)}>
                {describeCall(c)}
              </code>
            ))}
          </div>
        )}
        {turn.answer ? <Markdown text={turn.answer} /> : waiting && !turn.thinking ? <p className="muted">Working…</p> : null}
        {turn.error && <p className="small neg">{turn.error}</p>}
        {!streaming && turn.usage.output > 0 && (
          <p className="small muted">
            {turn.usage.input.toLocaleString()} tokens in ({turn.usage.cached.toLocaleString()} from cache), {turn.usage.output.toLocaleString()} out
          </p>
        )}
      </div>
    </div>
  )
}

/** "transactions(payee: Netflix, limit: 10)" for the chip under an answer. */
function describeCall({ name, input }: ToolCall): string {
  const args = Object.entries((input ?? {}) as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${String(v)}`)
  return `${name}(${args.join(', ')})`
}
