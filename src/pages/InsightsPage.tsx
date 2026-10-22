import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReportsNav } from '../components/ReportsNav'
import { currentDate, currentMonth, shortMonth } from '../model/dates'
import { sinceFirstActivity, sum } from '../model/ledger'
import { recurringPayees, reserveHealth, targetAdherence, topPayees, type RecurringPayee, type TargetVerdict } from '../model/insights'
import { formatCents } from '../model/money'
import { buildReport, monthRange } from '../model/reports'
import { buildSubscriptionPrompt } from '../model/subscriptionPrompt'
import { trendPath } from '../model/trend'
import { INCOME_CATEGORY_ID, type BudgetFile, type Cents } from '../model/types'
import { useBudget } from '../store/budgetStore'

const RANGES = [12, 24]

/**
 * What the numbers say across payees and targets: subscriptions and other fixed costs,
 * how targets compare with what actually happens, who gets the most money, and how the
 * reserves are holding up.
 */
export function InsightsPage() {
  const file = useBudget((s) => s.file)!
  const setNotRecurring = useBudget((s) => s.setNotRecurring)
  const [count, setCount] = useState(12)
  const today = currentDate()
  const months = useMemo(() => sinceFirstActivity(file, monthRange(currentMonth(), count)), [file, count])
  const recurring = useMemo(() => recurringPayees(file, today), [file, today])
  const targets = useMemo(() => targetAdherence(file, months), [file, months])
  const payees = useMemo(() => topPayees(file, months), [file, months])
  const reserves = useMemo(() => reserveHealth(file, months, today), [file, months, today])
  const avgIncome = useMemo(() => buildReport(file, months).avgIncome, [file, months])
  const categoryName = (id: string | null) =>
    id === null ? 'Uncategorized' : id === INCOME_CATEGORY_ID ? 'Income' : file.categories.find((c) => c.id === id)?.name ?? '?'
  const categoryCell = (id: string | null) =>
    id && id !== INCOME_CATEGORY_ID ? <Link to={trendPath({ kind: 'category', id })}>{categoryName(id)}</Link> : <span className="muted">{categoryName(id)}</span>

  const priceChanges = recurring.payees.filter((p) => p.priceChange)
  const started = recurring.payees.filter((p) => p.status === 'new')
  const stopped = recurring.payees.filter((p) => p.status === 'stopped')
  // The tables show what is still charging; what stopped is listed above them.
  const monthly = recurring.payees.filter((p) => p.cadence === 'monthly' && p.status !== 'stopped')
  const yearly = recurring.payees.filter((p) => p.cadence === 'yearly' && p.status !== 'stopped')
  const monthlyTotal = sum(monthly.map((p) => p.priceChange?.to ?? p.amount))
  const yearlyTotal = sum(yearly.map((p) => p.amount))
  const yearlyPerMonth = sum(yearly.map((p) => p.monthlyCost))
  const dismissed = file.notRecurring ?? []

  return (
    <>
      <header className="page-header">
        <h2>Reports</h2>
        <ReportsNav />
        <div className="segmented">
          {RANGES.map((n) => (
            <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>
              {n} months
            </button>
          ))}
        </div>
      </header>
      <div className="page-body">
        <section className="card recurring">
          <h3>Recurring payees and subscriptions</h3>
          <p className="muted">
            Payees that bill like a subscription: about once a month on a set day or for a set amount (three or more times in the last 13
            months), or once a year for a steady amount (twice in the last two years). Fixed costs are the ones whose amount holds steady; a
            yearly charge counts a twelfth per month. Anything that is really a habit can be marked "not recurring" from its row.
          </p>
          <div className="stat-row">
            <Stat label="Fixed costs per month" value={recurring.fixedMonthly} />
            <div className="stat">
              <span className="muted">Share of income</span>
              <strong>{avgIncome > 0 ? `${Math.round((100 * recurring.fixedMonthly) / avgIncome)}%` : '—'}</strong>
              <span className="muted">of {formatCents(avgIncome)} avg</span>
            </div>
            <div className="stat">
              <span className="muted">Recurring payees</span>
              <strong>{recurring.count}</strong>
            </div>
          </div>
          <AnalyzeRow file={file} today={today} />
          {(priceChanges.length > 0 || started.length > 0 || stopped.length > 0) && (
            <div className="insight-highlights">
              {priceChanges.length > 0 && (
                <div>
                  <h4>Price changes</h4>
                  <ul className="movers">
                    {priceChanges.map((p) => (
                      <li key={p.payee}>
                        <PayeeLink payee={p.payee} />
                        <span className={`mover-delta ${p.priceChange!.to > p.priceChange!.from ? 'soft-neg' : 'soft-pos'}`}>
                          {formatCents(p.priceChange!.from)} → {formatCents(p.priceChange!.to)}
                        </span>
                        <span className="muted">since {shortMonth(p.priceChange!.since)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {started.length > 0 && (
                <div>
                  <h4>New</h4>
                  <ul className="movers">
                    {started.map((p) => (
                      <li key={p.payee}>
                        <PayeeLink payee={p.payee} />
                        <span className="mover-delta">{formatCents(p.monthlyCost)}</span>
                        <span className="muted">started {shortMonth(p.firstDate.slice(0, 7))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {stopped.length > 0 && (
                <div>
                  <h4>Stopped</h4>
                  <ul className="movers">
                    {stopped.map((p) => (
                      <li key={p.payee}>
                        <PayeeLink payee={p.payee} />
                        <span className="mover-delta soft-pos">{formatCents(p.monthlyCost)}</span>
                        <span className="muted">last seen {shortMonth(p.lastDate.slice(0, 7))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <h4>Monthly</h4>
          {monthly.length === 0 ? (
            <p className="muted">No monthly payees yet. They show up once a payee has charged three months in a row on a set day or for a set amount.</p>
          ) : (
            <table className="grid insight-table">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th>Last charged</th>
                  <th></th>
                  <th className="row-actions"></th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((p) => (
                  <tr key={p.payee}>
                    <td>
                      <PayeeLink payee={p.payee} />
                    </td>
                    <td>{categoryCell(p.categoryId)}</td>
                    <td className="num">{formatCents(p.priceChange?.to ?? p.amount)}</td>
                    <td className="muted">{p.lastDate}</td>
                    <td>
                      <StatusTags p={p} />
                    </td>
                    <td className="row-actions">
                      <button className="link" title="Leave this payee out of the recurring report" onClick={() => setNotRecurring(p.payee, true)}>
                        not recurring
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <th colSpan={2}>Total per month</th>
                  <td className="num">{formatCents(monthlyTotal)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          )}
          <h4>Yearly</h4>
          {yearly.length === 0 ? (
            <p className="muted">No yearly payees yet. They show up once a payee has charged twice, about a year apart, for about the same amount.</p>
          ) : (
            <table className="grid insight-table">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Category</th>
                  <th className="num">Amount</th>
                  <th className="num">Per month</th>
                  <th>Last charged</th>
                  <th>Next due</th>
                  <th></th>
                  <th className="row-actions"></th>
                </tr>
              </thead>
              <tbody>
                {yearly.map((p) => (
                  <tr key={p.payee}>
                    <td>
                      <PayeeLink payee={p.payee} />
                    </td>
                    <td>{categoryCell(p.categoryId)}</td>
                    <td className="num">{formatCents(p.amount)}</td>
                    <td className="num">{formatCents(p.monthlyCost)}</td>
                    <td className="muted">{p.lastDate}</td>
                    <td className="muted">{p.nextDate ?? '—'}</td>
                    <td>
                      <StatusTags p={p} />
                    </td>
                    <td className="row-actions">
                      <button className="link" title="Leave this payee out of the recurring report" onClick={() => setNotRecurring(p.payee, true)}>
                        not recurring
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <th colSpan={2}>Total per year</th>
                  <td className="num">{formatCents(yearlyTotal)}</td>
                  <td className="num">{formatCents(yearlyPerMonth)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          )}
          {dismissed.length > 0 && (
            <p className="muted dismissed-payees">
              Marked not recurring:{' '}
              {dismissed.map((payee, i) => (
                <span key={payee}>
                  {i > 0 && ', '}
                  {payee}{' '}
                  <button className="link" title="Show this payee in the recurring report again" onClick={() => setNotRecurring(payee, false)}>
                    undo
                  </button>
                </span>
              ))}
            </p>
          )}
        </section>

        <section className="card">
          <h3>Targets vs reality</h3>
          {targets.rows.length === 0 ? (
            <p className="muted">
              No category has a monthly target yet. Set one from the category's panel on the <Link to="/app/budget">Budget</Link> page and
              this will show how spending compares with it.
            </p>
          ) : (
            <>
              <p className="muted">
                Targets add up to <strong>{formatCents(targets.totals.target)}</strong> a month; what actually happened averages{' '}
                <strong>{formatCents(targets.totals.actual)}</strong> over the last {count} months. For a reserve, "actual" is what was assigned
                to it, not what was spent from it.
              </p>
              <table className="grid insight-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Target</th>
                    <th className="num">Actual avg</th>
                    <th className="num">Difference</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {targets.rows.map((r) => (
                    <tr key={r.category.id}>
                      <td>
                        <Link to={trendPath({ kind: 'category', id: r.category.id })}>{r.category.name}</Link>
                        {r.category.reserve && <span className="tag">reserve</span>}
                      </td>
                      <td className="num">{formatCents(r.target)}</td>
                      <td className="num">{formatCents(r.actual)}</td>
                      <td className={`num ${r.verdict === 'over' ? 'soft-neg' : r.verdict === 'under' ? 'soft-pos' : ''}`}>
                        {r.delta === 0 ? <span className="muted">–</span> : `${r.delta > 0 ? '▲' : '▼'} ${formatCents(Math.abs(r.delta))}`}
                        {r.delta !== 0 && <span className="muted count"> · {Math.round(Math.abs(r.pct) * 100)}%</span>}
                      </td>
                      <td>
                        <VerdictTag verdict={r.verdict} reserve={!!r.category.reserve} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="card">
          <h3>Top payees</h3>
          <p className="muted">Where the most money went over the last {count} months, net of refunds. Change compares the later half of the range with the earlier half.</p>
          {payees.length === 0 ? (
            <p className="muted">Nothing in this range.</p>
          ) : (
            <table className="grid insight-table">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Category</th>
                  <th className="num">Transactions</th>
                  <th className="num">Total</th>
                  <th className="num">Per month</th>
                  <th className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {payees.map((p) => (
                  <tr key={p.payee}>
                    <td>
                      <PayeeLink payee={p.payee} />
                    </td>
                    <td>{categoryCell(p.categoryId)}</td>
                    <td className="num">{p.count}</td>
                    <td className="num">{formatCents(p.total)}</td>
                    <td className="num">{formatCents(p.average)}</td>
                    <td className={`num ${p.shift > 0 ? 'soft-neg' : p.shift < 0 ? 'soft-pos' : ''}`}>
                      {p.shift === 0 ? <span className="muted">–</span> : `${p.shift > 0 ? '▲' : '▼'} ${formatCents(Math.abs(p.shift))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h3>Reserve health</h3>
          {reserves.length === 0 ? (
            <p className="muted">
              No categories are marked as reserves. Mark sinking funds (vacation, buffer, investments) from the <Link to="/app/reports">Overview</Link>{' '}
              page to track how they fill and drain.
            </p>
          ) : (
            <>
              <p className="muted">What each reserve holds now, how much goes in and comes out each month on average, and how long the balance would last at that draw rate.</p>
              <table className="grid insight-table">
                <thead>
                  <tr>
                    <th>Reserve</th>
                    <th className="num">Balance</th>
                    <th className="num">Set aside / month</th>
                    <th className="num">Drawn / month</th>
                    <th className="num">Net / month</th>
                    <th className="num">Target</th>
                    <th>Runway</th>
                  </tr>
                </thead>
                <tbody>
                  {reserves.map((r) => (
                    <tr key={r.category.id}>
                      <td>
                        <Link to={trendPath({ kind: 'category', id: r.category.id })}>{r.category.name}</Link>
                      </td>
                      <td className={`num ${r.balance < 0 ? 'neg' : ''}`}>{formatCents(r.balance)}</td>
                      <td className="num">{formatCents(r.avgSetAside)}</td>
                      <td className="num">{formatCents(r.avgDrawn)}</td>
                      <td className={`num ${r.net > 0 ? 'soft-pos' : r.net < 0 ? 'soft-neg' : ''}`}>{formatCents(r.net)}</td>
                      <td className="num">
                        {r.target === undefined ? (
                          <span className="muted">–</span>
                        ) : (
                          <>
                            {formatCents(r.target)}
                            {r.vsTarget !== null && r.vsTarget !== 0 && (
                              <span className={`count ${r.vsTarget < 0 ? 'soft-neg' : 'soft-pos'}`}>
                                {' '}
                                · {r.vsTarget < 0 ? '▼' : '▲'} {formatCents(Math.abs(r.vsTarget))}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="muted">{r.runwayMonths === null ? 'not drawn from' : `covers ${r.runwayMonths} months of draws`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </>
  )
}

/** Longest URL we trust a chat site to accept as a prefilled prompt; past that the prompt goes via the clipboard. */
const MAX_PROMPT_URL = 8000

const CHATS = {
  claude: { label: 'Claude', url: 'https://claude.ai/new', param: 'q' },
  chatgpt: { label: 'ChatGPT', url: 'https://chatgpt.com/', param: 'q' },
}

// Brand marks from simple-icons (CC0). Claude keeps its orange; OpenAI follows the text color.
const CLAUDE_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="#d97757">
    <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
  </svg>
)

const OPENAI_MARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
)

/**
 * Hands the recurring list to the person's own chat assistant, in a new tab, so it can tell
 * subscriptions from habits and name the annual renewals. No key, no server: the prompt is
 * built here and either prefilled through the URL or copied for pasting when too long.
 */
function AnalyzeRow({ file, today }: { file: BudgetFile; today: string }) {
  const [note, setNote] = useState('')
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }
  const open = async (chat: keyof typeof CHATS) => {
    const prompt = buildSubscriptionPrompt(file, today)
    const { label, url, param } = CHATS[chat]
    const withPrompt = `${url}?${param}=${encodeURIComponent(prompt)}`
    if (withPrompt.length <= MAX_PROMPT_URL) {
      window.open(withPrompt, '_blank', 'noopener')
      setNote(`Opened ${label} with the prompt filled in.`)
    } else {
      const copied = await copy(prompt)
      window.open(url, '_blank', 'noopener')
      setNote(copied ? `The list is long, so the prompt was copied instead: paste it into ${label}.` : 'Could not copy the prompt; use "Copy prompt" and paste it.')
    }
  }
  const copyOnly = async () => {
    setNote((await copy(buildSubscriptionPrompt(file, today))) ? 'Prompt copied. Paste it into any chat assistant.' : 'Could not reach the clipboard.')
  }
  return (
    <div className="analyze-row">
      <span className="muted">Ask an AI which of these are subscriptions and when the annual ones renew. Only the payee names, amounts and dates above are sent, to the chat you pick.</span>
      <button className="secondary" onClick={() => open('claude')}>
        {CLAUDE_MARK} Open in Claude
      </button>
      <button className="secondary" onClick={() => open('chatgpt')}>
        {OPENAI_MARK} Open in ChatGPT
      </button>
      <button className="secondary" onClick={copyOnly}>
        Copy prompt
      </button>
      {note && <span className="muted">{note}</span>}
    </div>
  )
}

function PayeeLink({ payee }: { payee: string }) {
  return (
    <Link className="mover-name" to={trendPath({ kind: 'payee', name: payee })} title="Spending over time">
      {payee}
    </Link>
  )
}

function StatusTags({ p }: { p: RecurringPayee }) {
  return (
    <>
      {p.status === 'new' && <span className="tag">new</span>}
      {p.status === 'stopped' && <span className="tag tag-muted">stopped</span>}
      {p.priceChange && <span className={`tag ${p.priceChange.to > p.priceChange.from ? 'tag-warn' : ''}`}>{p.priceChange.to > p.priceChange.from ? 'price up' : 'price down'}</span>}
      {!p.stable && <span className="tag tag-muted">varies</span>}
    </>
  )
}

function VerdictTag({ verdict, reserve }: { verdict: TargetVerdict; reserve: boolean }) {
  if (verdict === 'on') return <span className="tag tag-muted">on target</span>
  // Spending over a living target is the problem; assigning under a reserve target is.
  const bad = reserve ? verdict === 'under' : verdict === 'over'
  const label = reserve ? (verdict === 'over' ? 'over-funded' : 'under-funded') : verdict === 'over' ? 'over target' : 'under target'
  return <span className={`tag ${bad ? 'tag-warn' : ''}`}>{label}</span>
}

function Stat({ label, value }: { label: string; value: Cents }) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>{formatCents(value)}</strong>
    </div>
  )
}
