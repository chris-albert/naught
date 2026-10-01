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

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback: (error: { type: string; message?: string }) => void
      }): { requestAccessToken(overrides?: { prompt?: string }): void }
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

/** Opens Google's popup; it closes by itself when the user has already granted access. */
async function requestToken(): Promise<Token> {
  await loadGoogleSignIn()
  return new Promise((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: CLIENT_ID!,
        scope: SCOPE,
        callback: (r) => {
          if (r.access_token) resolve({ value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 0) * 1000 })
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
      .requestAccessToken({ prompt: '' })
  })
}

// Browser-only sign-in gets a token that lasts about an hour and cannot be refreshed silently.
let token: Token | undefined

const usable = (t: Token | undefined): t is Token => !!t && t.expiresAt > Date.now() + 60_000

async function accessToken(): Promise<string> {
  token ??= await get<Token>(TOKEN_KEY)
  if (!usable(token)) {
    token = await requestToken()
    await set(TOKEN_KEY, token)
  }
  return token.value
}

/** Whether Drive can be used right now without asking the user to sign in again. */
export async function hasDriveAccess(): Promise<boolean> {
  token ??= await get<Token>(TOKEN_KEY)
  return usable(token)
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
