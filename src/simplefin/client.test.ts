import { beforeEach, describe, expect, it, vi } from 'vitest'

const URL_KEY = 'naught.simplefin.accessUrl'

// This browser's IndexedDB, and the app's hidden folder in Drive.
const local = new Map<string, unknown>()
const drive = { available: true, files: new Map<string, string>(), reads: 0 }

vi.mock('idb-keyval', () => ({
  get: async (k: string) => local.get(k),
  set: async (k: string, v: unknown) => void local.set(k, v),
  del: async (k: string) => void local.delete(k),
}))
vi.mock('../storage/googleDrive', () => ({
  canUseAppData: async () => drive.available,
  readAppData: async (name: string) => {
    drive.reads++
    return drive.files.get(name)
  },
  writeAppData: async (name: string, text: string) => void drive.files.set(name, text),
}))

/** A fresh page load: the once-per-load sync runs again. */
async function loadClient() {
  vi.resetModules()
  return import('./client')
}

const stored = () => JSON.parse(drive.files.get('simplefin.json')!).accessUrl

describe('simplefin credentials across devices', () => {
  beforeEach(() => {
    local.clear()
    drive.files.clear()
    drive.available = true
    drive.reads = 0
  })

  it('uploads the key a device already had', async () => {
    local.set(URL_KEY, 'https://a')
    expect(await (await loadClient()).getAccessUrl()).toBe('https://a')
    expect(stored()).toBe('https://a')
  })

  it('picks up the key on a new device', async () => {
    drive.files.set('simplefin.json', JSON.stringify({ accessUrl: 'https://a' }))
    expect(await (await loadClient()).getAccessUrl()).toBe('https://a')
    expect(local.get(URL_KEY)).toBe('https://a')
  })

  it('replaces a different key with the one in Drive', async () => {
    local.set(URL_KEY, 'https://old')
    drive.files.set('simplefin.json', JSON.stringify({ accessUrl: 'https://new' }))
    expect(await (await loadClient()).getAccessUrl()).toBe('https://new')
  })

  it('stores a newly connected key in Drive', async () => {
    drive.files.set('simplefin.json', JSON.stringify({ accessUrl: 'https://old' }))
    const client = await loadClient()
    await client.claimSetupToken('https://new')
    expect(stored()).toBe('https://new')
    expect(await client.getAccessUrl()).toBe('https://new')
  })

  it('disconnects every device', async () => {
    local.set(URL_KEY, 'https://a')
    const first = await loadClient()
    await first.getAccessUrl()
    await first.clearAccessUrl()
    expect(stored()).toBeNull()

    // Another device that still has the key.
    local.clear()
    local.set(URL_KEY, 'https://a')
    expect(await (await loadClient()).getAccessUrl()).toBeUndefined()
  })

  it('uploads a change made while Drive was unreachable instead of losing it', async () => {
    drive.files.set('simplefin.json', JSON.stringify({ accessUrl: 'https://old' }))
    drive.available = false
    await (await loadClient()).claimSetupToken('https://new')
    expect(stored()).toBe('https://old')

    drive.available = true
    expect(await (await loadClient()).getAccessUrl()).toBe('https://new')
    expect(stored()).toBe('https://new')
  })

  it('leaves Drive alone when there is no key anywhere', async () => {
    expect(await (await loadClient()).getAccessUrl()).toBeUndefined()
    expect(drive.files.size).toBe(0)
  })

  it('checks Drive once per page load', async () => {
    const client = await loadClient()
    await Promise.all([client.getAccessUrl(), client.getAccessUrl()])
    await client.getAccessUrl()
    expect(drive.reads).toBe(1)
  })

  it('works without Drive', async () => {
    drive.available = false
    const client = await loadClient()
    await client.claimSetupToken('https://a')
    expect(await client.getAccessUrl()).toBe('https://a')
    expect(drive.files.size).toBe(0)
  })
})
