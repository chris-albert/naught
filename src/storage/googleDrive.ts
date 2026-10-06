import { del, get, set } from 'idb-keyval'
import type { BudgetFile } from '../model/types'
import { ConflictError, parseBudgetFile, type BudgetStorage, type OpenedBudget } from './storage'

/**
 * Budget files in the user's own Google Drive, reached straight from the
 * browser. The `drive.file` scope only lets the app see files it created, so
 * every file it can list is a budget. `drive.appdata` adds a hidden folder
 * only this app can read, used for the SimpleFIN credentials.
 */

const CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata'
const FILES = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

const TOKEN_KEY = 'naught.drive.token'
const FILE_KEY = 'naught.drive.file'

export const supportsGoogleDrive = !!CLIENT_ID

export interface DriveFile {
  id: string
  name: string
}

interface Token {
  value: string
  /** Epoch milliseconds. */
  expiresAt: number
}

interface CodeResponse {
  code?: string
  error?: string
  error_description?: string
}

declare const google: {
  accounts: {
    oauth2: {
      initCodeClient(config: {
        client_id: string
        scope: string
        ux_mode: 'popup'
        callback: (response: CodeResponse) => void
        error_callback: (error: { type: string; message?: string }) => void
      }): { requestCode(): void }
    }
  }
}

let gis: Promise<void> | undefined

/**
 * Load Google's sign-in script. Call ahead of the click that signs in: browsers
 * only allow the sign-in popup shortly after a click, and loading eats into that.
 */
export function loadGoogleSignIn(): Promise<void> {
  return (gis ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => resolve()
    script.onerror = () => {
      gis = undefined
      reject(new Error('Could not load Google sign-in'))
    }
    document.head.append(script)
  }))
}

/**
 * The sign-in routes in functions/auth. They hold the refresh token in a cookie
 * the page cannot read and hand out access tokens, which last about an hour.
 */
const auth = (action: 'exchange' | 'refresh' | 'signout', body?: unknown) =>
  fetch(`/auth/${action}`, {
    method: 'POST',
    ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })

async function tokenFrom(res: Response): Promise<Token> {
  const r = (await res.json()) as { access_token: string; expires_in: number }
  return { value: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 }
}

/** Opens Google's popup for a one-time code, which the server trades for tokens. */
async function signIn(): Promise<Token> {
  await loadGoogleSignIn()
  const code = await new Promise<string>((resolve, reject) => {
    google.accounts.oauth2
      .initCodeClient({
        client_id: CLIENT_ID!,
        scope: SCOPE,
        ux_mode: 'popup',
        callback: (r) => {
          if (r.code) resolve(r.code)
          else reject(new Error(`Google sign-in failed: ${r.error_description ?? r.error ?? 'unknown error'}`))
        },
        error_callback: (e) =>
          reject(
            new Error(
              e.type === 'popup_failed_to_open'
                ? 'Google sign-in has expired and the browser blocked the popup. Click to sign in again.'
                : 'Google sign-in was cancelled',
            ),
          ),
      })
      .requestCode()
  })
  const res = await auth('exchange', { code })
  if (!res.ok) throw new Error(`Google sign-in failed: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.status}`)
  return tokenFrom(res)
}

/** A new token from the refresh cookie; undefined when there is none or Google no longer accepts it. */
async function refresh(): Promise<Token | undefined> {
  const res = await auth('refresh')
  if (res.status === 401) return undefined
  if (!res.ok) throw new Error(`Google sign-in could not be renewed (${res.status})`)
  return tokenFrom(res)
}

let token: Token | undefined

const usable = (t: Token | undefined): t is Token => !!t && t.expiresAt > Date.now() + 60_000

/** The cached token, renewed through the refresh cookie once it expires; undefined when the user has to sign in again. */
async function silentToken(): Promise<Token | undefined> {
  token ??= await get<Token>(TOKEN_KEY)
  if (!usable(token)) {
    token = await refresh()
    if (token) await set(TOKEN_KEY, token)
  }
  return token
}

async function accessToken(): Promise<string> {
  let t = await silentToken()
  if (!t) {
    t = token = await signIn()
    await set(TOKEN_KEY, t)
  }
  return t.value
}

/** Whether Drive can be used right now without asking the user to sign in again. */
export const hasDriveAccess = async () => !!(await silentToken())

/** Revokes the sign-in with Google, so this browser cannot reach Drive until the user signs in again. */
export async function signOutOfDrive(): Promise<void> {
  token = undefined
  await del(TOKEN_KEY)
  await auth('signout')
}

async function api(url: string, init: RequestInit = {}): Promise<Response> {
  const call = async () => fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` } })
  let res = await call()
  if (res.status === 401) {
    // Revoked or expired early: sign in again and retry once.
    token = undefined
    await del(TOKEN_KEY)
    res = await call()
  }
  if (res.status === 404) throw new Error('That budget is no longer in Google Drive')
  if (!res.ok) throw new Error(`Google Drive request failed (${res.status})`)
  return res
}

const checksum = async (id: string) => ((await (await api(`${FILES}/${id}?fields=md5Checksum`)).json()) as { md5Checksum: string }).md5Checksum

async function read(id: string): Promise<{ data: BudgetFile; md5: string }> {
  const md5 = await checksum(id)
  const res = await api(`${FILES}/${id}?alt=media`)
  return { data: parseBudgetFile(await res.text()), md5 }
}

async function upload(id: string, data: BudgetFile): Promise<string> {
  const res = await api(`${UPLOAD}/${id}?uploadType=media&fields=md5Checksum`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return ((await res.json()) as { md5Checksum: string }).md5Checksum
}

function driveStorage(file: DriveFile, md5: string): BudgetStorage {
  // Checksum of the contents we last read or wrote. Anything else on Drive means another device saved.
  let known = md5
  return {
    name: file.name,
    async write(data, overwrite = false) {
      if (!overwrite && (await checksum(file.id)) !== known) throw new ConflictError()
      known = await upload(file.id, data)
    },
    async readIfChanged() {
      if ((await checksum(file.id)) === known) return null
      const theirs = await read(file.id)
      known = theirs.md5
      return theirs.data
    },
  }
}

/** Budgets this app has saved to the signed-in user's Drive, most recently changed first. Signs in if needed. */
export async function listDriveBudgets(): Promise<DriveFile[]> {
  const params = new URLSearchParams({ q: 'trashed=false', fields: 'files(id,name)', orderBy: 'modifiedTime desc' })
  const res = await api(`${FILES}?${params}`)
  return ((await res.json()) as { files: DriveFile[] }).files
}

export async function openDriveBudget(file: DriveFile): Promise<OpenedBudget> {
  const { data, md5 } = await read(file.id)
  await set(FILE_KEY, file)
  return { data, storage: driveStorage(file, md5) }
}

export async function createDriveBudget(data: BudgetFile): Promise<BudgetStorage> {
  const res = await api(FILES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `${data.name || 'budget'}.naught.json`, mimeType: 'application/json' }),
  })
  const file = (await res.json()) as DriveFile
  const md5 = await upload(file.id, data)
  await set(FILE_KEY, { id: file.id, name: file.name })
  return driveStorage(file, md5)
}

export const rememberedDriveFile = () => get<DriveFile>(FILE_KEY)
export const forgetDriveFile = () => del(FILE_KEY)

/** Whether the last opened budget lives in Drive and we are signed in, so app data is reachable without a sign-in popup. */
export const canUseAppData = async () => supportsGoogleDrive && !!(await rememberedDriveFile()) && (await hasDriveAccess())

async function appDataId(name: string): Promise<string | undefined> {
  const params = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${name}'`, fields: 'files(id)' })
  const res = await api(`${FILES}?${params}`)
  return ((await res.json()) as { files: { id: string }[] }).files[0]?.id
}

/** Contents of a file in the app's hidden Drive folder; undefined if it does not exist. */
export async function readAppData(name: string): Promise<string | undefined> {
  const id = await appDataId(name)
  return id && (await api(`${FILES}/${id}?alt=media`)).text()
}

export async function writeAppData(name: string, text: string): Promise<void> {
  let id = await appDataId(name)
  if (!id) {
    const res = await api(FILES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: ['appDataFolder'] }),
    })
    id = ((await res.json()) as { id: string }).id
  }
  await api(`${UPLOAD}/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text })
}
