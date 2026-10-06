import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from '../../functions/auth/[action]'

// The Pages Function behind /auth/*; it lives outside src so Cloudflare deploys it as a route.

const env = { VITE_GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'shh' }

/** Google's token endpoint, answering with `reply` and recording what it was asked. */
function fakeGoogle(reply: unknown) {
  const calls: { url: string; params: Record<string, string> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, params: Object.fromEntries(init.body as URLSearchParams) })
      return new Response(JSON.stringify(reply))
    }),
  )
  return calls
}

const post = (action: string, init: RequestInit = {}, origin = 'https://naught.test') =>
  onRequestPost({ request: new Request(`${origin}/auth/${action}`, { method: 'POST', ...init }), env, params: { action } })

const exchange = (code: string, origin?: string) => post('exchange', { body: JSON.stringify({ code }) }, origin)

describe('auth function', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('exchanges the code with the secret, keeps the refresh token in a cookie, and returns the access token', async () => {
    const calls = fakeGoogle({ access_token: 'at', expires_in: 3599, refresh_token: 'rt' })
    const res = await exchange('c0de')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ access_token: 'at', expires_in: 3599 })
    expect(res.headers.get('Set-Cookie')).toBe('naught_refresh=rt; Max-Age=34560000; Path=/auth; HttpOnly; SameSite=Strict; Secure')
    expect(calls).toEqual([
      {
        url: 'https://oauth2.googleapis.com/token',
        params: { client_id: 'cid', client_secret: 'shh', code: 'c0de', grant_type: 'authorization_code', redirect_uri: 'postmessage' },
      },
    ])
  })

  it('leaves the cookie insecure on plain http, which only local development uses', async () => {
    fakeGoogle({ access_token: 'at', expires_in: 3599, refresh_token: 'rt' })
    const res = await exchange('c0de', 'http://localhost:8788')
    expect(res.headers.get('Set-Cookie')).not.toContain('Secure')
  })

  it('reports an exchange that gave no refresh token', async () => {
    fakeGoogle({ access_token: 'at', expires_in: 3599 })
    const res = await exchange('c0de')
    expect(res.status).toBe(502)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('passes on what Google said when the code is bad', async () => {
    fakeGoogle({ error: 'invalid_grant', error_description: 'Bad Request' })
    const res = await exchange('stale')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Bad Request' })
  })

  it('renews the access token from the cookie', async () => {
    const calls = fakeGoogle({ access_token: 'at2', expires_in: 3599 })
    const res = await post('refresh', { headers: { Cookie: 'other=1; naught_refresh=rt' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ access_token: 'at2', expires_in: 3599 })
    expect(calls[0].params).toEqual({ client_id: 'cid', client_secret: 'shh', refresh_token: 'rt', grant_type: 'refresh_token' })
  })

  it('answers 401 without a cookie, and never asks Google', async () => {
    const calls = fakeGoogle({})
    expect((await post('refresh')).status).toBe(401)
    expect(calls).toEqual([])
  })

  it('clears a refresh token Google no longer accepts', async () => {
    fakeGoogle({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
    const res = await post('refresh', { headers: { Cookie: 'naught_refresh=rt' } })
    expect(res.status).toBe(401)
    expect(res.headers.get('Set-Cookie')).toBe('naught_refresh=; Max-Age=0; Path=/auth; HttpOnly; SameSite=Strict; Secure')
  })

  it('keeps the cookie when Google is merely unavailable', async () => {
    fakeGoogle({ error: 'internal_failure' })
    const res = await post('refresh', { headers: { Cookie: 'naught_refresh=rt' } })
    expect(res.status).toBe(502)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })

  it('signs out by revoking the refresh token and dropping the cookie', async () => {
    const calls = fakeGoogle({})
    const res = await post('signout', { headers: { Cookie: 'naught_refresh=rt' } })
    expect(res.status).toBe(204)
    expect(res.headers.get('Set-Cookie')).toContain('naught_refresh=; Max-Age=0')
    expect(calls).toEqual([{ url: 'https://oauth2.googleapis.com/revoke', params: { token: 'rt' } }])
  })

  it('rejects unknown actions', async () => {
    expect((await post('whatever')).status).toBe(404)
  })
})
