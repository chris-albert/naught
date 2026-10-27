import { useEffect, useState } from 'react'
import { clearApiKey, getApiKey, maskApiKey, parseApiKey, setApiKey } from '../ai/apiKey'

const CONSOLE_KEYS_URL = 'https://platform.claude.com/settings/keys'
const CREDITS_URL = 'https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers'

/** Settings → AI: where the Anthropic API key for the AI features is entered. */
export function AiPage() {
  const [stored, setStored] = useState<string | null | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const parsed = parseApiKey(draft)

  useEffect(() => {
    getApiKey().then((key) => setStored(key ?? null))
  }, [])

  const save = async () => {
    if (!parsed) return
    await setApiKey(parsed)
    setStored(parsed)
    setDraft('')
  }

  const remove = async () => {
    await clearApiKey()
    setStored(null)
  }

  return (
    <>
      <header className="page-header">
        <h2>AI</h2>
        <span className="muted">Optional features that use Claude, paid for with your own Anthropic API key.</span>
      </header>
      <div className="page-body">
        <section className="card">
          <h3>Anthropic API key</h3>
          {stored === undefined ? null : stored ? (
            <p>
              Key saved: <code>{maskApiKey(stored)}</code>.{' '}
              <button className="secondary" onClick={remove}>
                Remove
              </button>
            </p>
          ) : (
            <>
              <p className="muted">
                The key stays in this browser, not in your budget file, and is only sent to Anthropic. Each device needs it
                pasted once. Nothing about your budget leaves the page until you use an AI feature, and each one says what it
                sends.
              </p>
              <ol className="setup-steps">
                <li>
                  <a href={CONSOLE_KEYS_URL} target="_blank" rel="noreferrer">
                    Create an API key
                  </a>{' '}
                  in the Claude Console. A Claude Max or Team plan{' '}
                  <a href={CREDITS_URL} target="_blank" rel="noreferrer">
                    includes monthly API credits
                  </a>
                  ; otherwise add a few dollars of credit.
                </li>
                <li>Paste the key below.</li>
              </ol>
              <input
                type="password"
                autoComplete="off"
                style={{ width: '100%' }}
                placeholder="sk-ant-…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && parsed) save()
                }}
              />
              <p className="muted small">
                {!draft.trim() ? ' ' : parsed ? 'Key recognized.' : 'That does not look like an Anthropic key. They start with sk-ant-.'}
              </p>
              <p>
                <button onClick={save} disabled={!parsed}>
                  Save
                </button>
              </p>
            </>
          )}
        </section>
      </div>
    </>
  )
}
