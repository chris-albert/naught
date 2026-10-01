import { del, get, set } from 'idb-keyval'
import { canUseAppData, readAppData, writeAppData } from '../storage/googleDrive'

/**
 * SimpleFIN Bridge client. The access URL carries the credentials and is kept
 * in IndexedDB, never in the budget file. For a budget in Google Drive it is
 * also copied to the app's hidden Drive folder, so other devices pick it up.
 */

const ACCESS_URL_KEY = 'naught.simplefin.accessUrl'
/** Set when this device changed the access URL and Drive does not have the change yet. */
const UNSYNCED_KEY = 'naught.simplefin.unsynced'
const DRIVE_NAME = 'simplefin.json'

export interface SimplefinTransaction {
  id: string
  /** Unix seconds. */
  posted: number
  transacted_at?: number
  /** Decimal string, positive = deposit. */
  amount: string
  description: string
  payee?: string
  memo?: string
  pending?: boolean
}

export interface SimplefinAccount {
  id: string
  name: string
  /** Institution name. */
  org: string
  currency: string
  /** Decimal string. */
  balance: string
  /** Decimal string; many banks report posted vs available differently around pending activity. */
  'available-balance'?: string
  'balance-date': number
  transactions: SimplefinTransaction[]
}

export interface SimplefinResult {
  accounts: SimplefinAccount[]
  errors: string[]
}

/**
 * Drive's copy wins, unless this device has a change it has not uploaded yet
 * or Drive has no copy at all. A copy holding null means "disconnected".
 * Returns false when Drive is not in use or not signed in.
 */
async function syncWithDrive(): Promise<boolean> {
  if (!(await canUseAppData())) return false
  const local = await get<string>(ACCESS_URL_KEY)
  const stored = await readAppData(DRIVE_NAME)
  if ((await get<boolean>(UNSYNCED_KEY)) || stored === undefined) {
    if (local || stored !== undefined) await writeAppData(DRIVE_NAME, JSON.stringify({ accessUrl: local ?? null }))
    await del(UNSYNCED_KEY)
    return true
  }
  const remote = (JSON.parse(stored) as { accessUrl: string | null }).accessUrl
  if (remote !== (local ?? null)) await (remote ? set(ACCESS_URL_KEY, remote) : del(ACCESS_URL_KEY))
  return true
}

let driveSync: Promise<void> | undefined

/** Sync once per page load. Failing is fine: the key in this browser still works. */
function syncOnce(): Promise<void> {
  return (driveSync ??= syncWithDrive().then(
    (ran) => {
      if (!ran) driveSync = undefined
    },
    (e) => console.warn('could not sync SimpleFIN credentials with Google Drive', e),
  ))
}

async function changeAccessUrl(accessUrl: string | undefined): Promise<void> {
  await (accessUrl ? set(ACCESS_URL_KEY, accessUrl) : del(ACCESS_URL_KEY))
  await set(UNSYNCED_KEY, true)
  driveSync = undefined
  await syncOnce()
}

export async function getAccessUrl(): Promise<string | undefined> {
  await syncOnce()
  return get<string>(ACCESS_URL_KEY)
}

export const clearAccessUrl = () => changeAccessUrl(undefined)

/**
 * Decode a setup token, claim it, and remember the resulting access URL.
 * An access URL pasted directly (e.g. the public demo one) is accepted as-is.
 */
export async function claimSetupToken(setupToken: string): Promise<string> {
  const input = setupToken.trim()
  if (/^https?:\/\//.test(input)) {
    new URL(input)
    await changeAccessUrl(input)
    return input
  }
  let claimUrl: string
  try {
    claimUrl = atob(input)
    new URL(claimUrl)
  } catch {
    throw new Error('That does not look like a SimpleFIN setup token')
  }
  const res = await fetch(claimUrl, { method: 'POST' })
  if (!res.ok) throw new Error(`SimpleFIN rejected the token (${res.status}). Tokens can only be claimed once.`)
  const accessUrl = (await res.text()).trim()
  await changeAccessUrl(accessUrl)
  return accessUrl
}

export async function fetchAccounts(
  accessUrl: string,
  opts: { startDate?: Date; endDate?: Date; pending?: boolean } = {},
): Promise<SimplefinResult> {
  const u = new URL(accessUrl)
  const auth = 'Basic ' + btoa(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`)
  u.username = ''
  u.password = ''
  const url = new URL(u.origin + u.pathname.replace(/\/$/, '') + '/accounts')
  if (opts.startDate) url.searchParams.set('start-date', String(Math.floor(opts.startDate.getTime() / 1000)))
  if (opts.endDate) url.searchParams.set('end-date', String(Math.floor(opts.endDate.getTime() / 1000)))
  if (opts.pending) url.searchParams.set('pending', '1')

  const res = await fetch(url, { headers: { Authorization: auth } })
  if (res.status === 403) throw new Error('SimpleFIN access was revoked or the token is disabled (403).')
  if (!res.ok) throw new Error(`SimpleFIN request failed (${res.status})`)
  const body = (await res.json()) as RawResponse
  return normalize(body)
}

// The v1 and v2 protocol shapes differ slightly; accept both.
interface RawResponse {
  errors?: string[]
  errlist?: { msg: string }[]
  connections?: { conn_id: string; name: string }[]
  accounts: (Omit<SimplefinAccount, 'org'> & { org?: { name?: string; domain?: string }; conn_id?: string })[]
}

function normalize(body: RawResponse): SimplefinResult {
  const connName = new Map((body.connections ?? []).map((c) => [c.conn_id, c.name]))
  return {
    errors: [...(body.errors ?? []), ...(body.errlist ?? []).map((e) => e.msg)],
    accounts: (body.accounts ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      org: a.org?.name ?? a.org?.domain ?? (a.conn_id && connName.get(a.conn_id)) ?? '',
      currency: a.currency,
      balance: a.balance,
      'available-balance': a['available-balance'],
      'balance-date': a['balance-date'],
      transactions: a.transactions ?? [],
    })),
  }
}
