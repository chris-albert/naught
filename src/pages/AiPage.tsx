import { useEffect, useState } from 'react'
import { checkApiKey, clearApiKey, getApiKey, maskApiKey, parseApiKey, setApiKey } from '../ai/apiKey'
import { SettingsNav } from '../components/SettingsNav'

const CONSOLE_KEYS_URL = 'https://platform.claude.com/settings/keys'
const CREDITS_URL = 'https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers'

/** Settings → AI: where the Anthropic API key for the AI features is entered. */
export function AiPage() {
  const [stored, setStored] = useState<string | null | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = parseApiKey(draft)

  useEffect(() => {
    getApiKey().then((key) => setStored(key ?? null))
  }, [])

  const save = async () => {
    if (!parsed || busy) return
    setBusy(true)
    setError(null)
    try {
      await checkApiKey(parsed)
      await setApiKey(parsed)
      setStored(parsed)
      setDraft('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    await clearApiKey()
    setStored(null)
  }

  return (
    <>
      <header className="page-header">
        <h2>Settings</h2>
        <SettingsNav />
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
                <li>Paste the key below. Saving checks it with Anthropic first.</li>
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
              <p className={`small ${error ? 'neg' : 'muted'}`}>
                {error ?? (!draft.trim() ? ' ' : parsed ? 'Key recognized.' : 'That does not look like an Anthropic key. They start with sk-ant-.')}
              </p>
              <p>
                <button onClick={save} disabled={!parsed || busy}>
                  {busy ? 'Checking…' : 'Save'}
                </button>
              </p>
            </>
          )}
        </section>
      </div>
    </>
  )
}
