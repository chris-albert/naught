import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyBudget } from '../model/types'
import { ConflictError } from './storage'

// A signed-in session: the cached token is still valid, so no popup is needed.
const idb = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => (key === 'naught.drive.token' ? { value: 'tok', expiresAt: Date.now() + 3_600_000 } : idb.get(key))),
  set: vi.fn(async (key: string, value: unknown) => void idb.set(key, value)),
  del: vi.fn(async (key: string) => void idb.delete(key)),
}))

import { createDriveBudget, listDriveBudgets, openDriveBudget, readAppData, writeAppData } from './googleDrive'

interface FakeRevision {
  id: string
  modifiedTime: string
  content: string
  keepForever?: boolean
}

/** A one-file fake of the Drive REST API. `md5` stands in for the content checksum; every upload adds a revision. */
function fakeDrive(initial = emptyBudget('remote')) {
  const drive = {
    content: JSON.stringify(initial),
    md5: 'v1',
    uploads: 0,
    auth: [] as (string | null)[],
    revisions: [{ id: 'r1', modifiedTime: '2026-10-01T10:00:00Z', content: JSON.stringify(initial) }] as FakeRevision[],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const json = (body: unknown) => new Response(JSON.stringify(body))
      if (input === '/auth/refresh') return json({ access_token: 'fresh', expires_in: 3600 })
      const url = new URL(input)
      drive.auth.push(new Headers(init.headers).get('Authorization'))
      const revisionId = url.pathname.match(/\/revisions\/([^/]+)$/)?.[1]
      if (revisionId) {
        const revision = drive.revisions.find((r) => r.id === revisionId)!
        if (init.method === 'PATCH') {
          revision.keepForever = JSON.parse(init.body as string).keepForever
          return json({ id: revisionId })
        }
        return new Response(revision.content)
      }
      if (url.pathname.endsWith('/revisions')) {
        return json({ revisions: drive.revisions.map(({ content, ...r }) => ({ ...r, size: String(content.length) })) })
      }
      if (init.method === 'PATCH') {
        drive.content = init.body as string
        drive.md5 = `v${++drive.uploads + 1}`
        const id = `r${drive.revisions.length + 1}`
        drive.revisions.push({ id, modifiedTime: new Date(Date.UTC(2026, 9, 1, 10, drive.revisions.length)).toISOString(), content: drive.content })
        return json({ md5Checksum: drive.md5, headRevisionId: id })
      }
      if (init.method === 'POST') return json({ id: 'new', name: JSON.parse(init.body as string).name })
      if (url.searchParams.get('alt') === 'media') return new Response(drive.content)
      if (url.searchParams.has('q')) return json({ files: [{ id: 'f1', name: 'a.naught.json' }] })
      return json({ md5Checksum: drive.md5 })
    }),
  )
  return drive
}

/** Wait for the fire-and-forget work a write leaves behind. */
const settle = () => new Promise((r) => setTimeout(r, 0))

/** Another device saves `name` as the budget's name. */
function savedElsewhere(drive: ReturnType<typeof fakeDrive>, name: string) {
  drive.content = JSON.stringify(emptyBudget(name))
  drive.md5 = 'theirs'
}

const file = { id: 'f1', name: 'a.naught.json' }

describe('google drive storage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    idb.clear()
  })

  it('lists and opens budgets with the bearer token', async () => {
    const drive = fakeDrive()
    expect(await listDriveBudgets()).toEqual([file])
    const { data, storage } = await openDriveBudget(file)
    expect(data.name).toBe('remote')
    expect(storage.name).toBe('a.naught.json')
    expect(new Set(drive.auth)).toEqual(new Set(['Bearer tok']))
  })

  it('saves repeatedly when nobody else touched the file', async () => {
    const drive = fakeDrive()
    const { storage } = await openDriveBudget(file)
    await storage.write(emptyBudget('one'))
    await storage.write(emptyBudget('two'))
    expect(JSON.parse(drive.content).name).toBe('two')
    expect(await storage.readIfChanged!()).toBeNull()
  })

  it('refuses to overwrite a save from another device', async () => {
    const drive = fakeDrive()
    const { storage } = await openDriveBudget(file)
    savedElsewhere(drive, 'phone')
    await expect(storage.write(emptyBudget('laptop'))).rejects.toBeInstanceOf(ConflictError)
    expect(JSON.parse(drive.content).name).toBe('phone')
  })

  it('overwrites when told to, and saves normally afterwards', async () => {
    const drive = fakeDrive()
    const { storage } = await openDriveBudget(file)
    savedElsewhere(drive, 'phone')
    await storage.write(emptyBudget('laptop'), true)
    await storage.write(emptyBudget('laptop again'))
    expect(JSON.parse(drive.content).name).toBe('laptop again')
  })

  it('hands back the other device’s version once, then saves on top of it', async () => {
    const drive = fakeDrive()
    const { storage } = await openDriveBudget(file)
    savedElsewhere(drive, 'phone')
    expect((await storage.readIfChanged!())?.name).toBe('phone')
    expect(await storage.readIfChanged!()).toBeNull()
    await storage.write(emptyBudget('laptop'))
    expect(JSON.parse(drive.content).name).toBe('laptop')
  })

  it('creates a budget file named after the budget', async () => {
    const drive = fakeDrive()
    const storage = await createDriveBudget(emptyBudget('Home'))
    expect(storage.name).toBe('Home.naught.json')
    expect(JSON.parse(drive.content).name).toBe('Home')
    await storage.write(emptyBudget('Home 2'))
    expect(JSON.parse(drive.content).name).toBe('Home 2')
  })

  it('renews an expired token through the refresh cookie, without a popup', async () => {
    const drive = fakeDrive()
    vi.setSystemTime(Date.now() + 2 * 3_600_000)
    try {
      expect(await listDriveBudgets()).toEqual([file])
    } finally {
      vi.useRealTimers()
    }
    expect(fetch).toHaveBeenCalledWith('/auth/refresh', { method: 'POST' })
    expect(drive.auth).toEqual(['Bearer fresh'])
  })

  it('lists earlier versions newest first and reads one back', async () => {
    const drive = fakeDrive()
    const { storage } = await openDriveBudget(file)
    await storage.write(emptyBudget('one'))
    await storage.write(emptyBudget('two'))
    await settle()
    const versions = await storage.versions!.list()
    expect(versions.map((v) => v.id)).toEqual(['r3', 'r2', 'r1'])
    expect(versions[0].savedAt > versions[1].savedAt).toBe(true)
    expect((await storage.versions!.read('r2')).name).toBe('one')
    expect(drive.revisions.find((r) => r.id === 'r1')?.content).toContain('remote')
  })

  it('keeps the first save of each day, and only the most recent kept ones', async () => {
    const drive = fakeDrive()
    const { storage } = await openDriveBudget(file)
    for (let i = 0; i < 65; i++) drive.revisions.push({ id: `old${i}`, modifiedTime: `2026-07-${String(1 + (i % 28)).padStart(2, '0')}T0${Math.floor(i / 28)}:00:00Z`, content: '{}', keepForever: true })
    await storage.write(emptyBudget('morning'))
    await storage.write(emptyBudget('afternoon'))
    await settle()
    const [morning, afternoon] = drive.revisions.slice(-2)
    const kept = drive.revisions.filter((r) => r.keepForever).map((r) => r.id)
    expect(kept).toContain(morning.id)
    expect(kept).not.toContain(afternoon.id)
    expect(kept).toHaveLength(60)
    // the oldest kept ones were let go
    expect(kept).not.toContain('old0')
  })

  it('reports a failed request', async () => {
    fakeDrive()
    const { storage } = await openDriveBudget(file)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await expect(storage.write(emptyBudget('x'))).rejects.toThrow('Google Drive request failed (500)')
  })
})

describe('google drive app data', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('creates the hidden file on first write, then reuses it', async () => {
    const files = new Map<string, { name: string; text: string }>()
    const created: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init: RequestInit = {}) => {
        const url = new URL(input)
        const id = url.pathname.split('/').pop()!
        if (init.method === 'POST') {
          const meta = JSON.parse(init.body as string)
          created.push(meta)
          files.set('h1', { name: meta.name, text: '' })
          return new Response(JSON.stringify({ id: 'h1' }))
        }
        if (init.method === 'PATCH') {
          files.get(id)!.text = init.body as string
          return new Response('{}')
        }
        if (url.searchParams.get('alt') === 'media') return new Response(files.get(id)!.text)
        expect(url.searchParams.get('spaces')).toBe('appDataFolder')
        return new Response(JSON.stringify({ files: [...files].map(([id]) => ({ id })) }))
      }),
    )
    expect(await readAppData('key.json')).toBeUndefined()
    await writeAppData('key.json', 'one')
    await writeAppData('key.json', 'two')
    expect(created).toEqual([{ name: 'key.json', parents: ['appDataFolder'] }])
    expect(await readAppData('key.json')).toBe('two')
  })
})
