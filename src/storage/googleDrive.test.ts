import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyBudget } from '../model/types'
import { ConflictError } from './storage'

// A signed-in session: the cached token is still valid, so no popup is needed.
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => (key === 'naught.drive.token' ? { value: 'tok', expiresAt: Date.now() + 3_600_000 } : undefined)),
  set: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
}))

import { createDriveBudget, listDriveBudgets, openDriveBudget } from './googleDrive'

/** A one-file fake of the Drive REST API. `md5` stands in for the content checksum. */
function fakeDrive(initial = emptyBudget('remote')) {
  const drive = { content: JSON.stringify(initial), md5: 'v1', uploads: 0, auth: [] as (string | null)[] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input)
      drive.auth.push(new Headers(init.headers).get('Authorization'))
      const json = (body: unknown) => new Response(JSON.stringify(body))
      if (init.method === 'PATCH') {
        drive.content = init.body as string
        drive.md5 = `v${++drive.uploads + 1}`
        return json({ md5Checksum: drive.md5 })
      }
      if (init.method === 'POST') return json({ id: 'new', name: JSON.parse(init.body as string).name })
      if (url.searchParams.get('alt') === 'media') return new Response(drive.content)
      if (url.searchParams.has('q')) return json({ files: [{ id: 'f1', name: 'a.naught.json' }] })
      return json({ md5Checksum: drive.md5 })
    }),
  )
  return drive
}

/** Another device saves `name` as the budget's name. */
function savedElsewhere(drive: ReturnType<typeof fakeDrive>, name: string) {
  drive.content = JSON.stringify(emptyBudget(name))
  drive.md5 = 'theirs'
}

const file = { id: 'f1', name: 'a.naught.json' }

describe('google drive storage', () => {
  beforeEach(() => vi.unstubAllGlobals())

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

  it('reports a failed request', async () => {
    fakeDrive()
    const { storage } = await openDriveBudget(file)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await expect(storage.write(emptyBudget('x'))).rejects.toThrow('Google Drive request failed (500)')
  })
})
