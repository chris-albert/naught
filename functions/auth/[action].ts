/**
 * Google sign-in for the Drive storage (src/storage/googleDrive.ts), run as a
 * Cloudflare Pages Function so neither the client secret nor the refresh token
 * ever reaches the browser. The page gets hour-long access tokens; the refresh
 * token that renews them sits in an HttpOnly cookie sent only to these routes.
 */

interface Env {
  VITE_GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
}

interface Context {
  request: Request
  env: Env
  params: { action: string | string[] }
}

interface GoogleTokens {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  error?: string
  error_description?: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const COOKIE = 'naught_refresh'
const COOKIE_MAX_AGE = 400 * 24 * 3600 // the longest browsers keep a cookie

async function googleToken(env: Env, params: Record<string, string>): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({ client_id: env.VITE_GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  })
  return (await res.json()) as GoogleTokens
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })

const accessToken = (t: GoogleTokens) => ({ access_token: t.access_token, expires_in: t.expires_in })

const failure = (t: GoogleTokens) => ({ error: t.error_description ?? t.error ?? 'unexpected response from Google' })

function cookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '' // plain http is only local development
  return `${COOKIE}=${value}; Max-Age=${maxAge}; Path=/auth; HttpOnly; SameSite=Strict${secure}`
}

const refreshToken = (request: Request) => request.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`))?.[1]

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  switch (params.action) {
    case 'exchange': {
      // The one-time code from Google's popup; 'postmessage' is the redirect URI that popup flow uses.
      const { code } = (await request.json()) as { code?: string }
      if (!code) return json({ error: 'missing code' }, 400)
      const t = await googleToken(env, { code, grant_type: 'authorization_code', redirect_uri: 'postmessage' })
      if (!t.access_token) return json(failure(t), 502)
      if (!t.refresh_token) return json({ error: 'Google issued no refresh token; remove Naught at myaccount.google.com/permissions and sign in again' }, 502)
      return json(accessToken(t), 200, { 'Set-Cookie': cookie(request, t.refresh_token, COOKIE_MAX_AGE) })
    }
    case 'refresh': {
      const rt = refreshToken(request)
      if (!rt) return json({ error: 'not signed in' }, 401)
      const t = await googleToken(env, { refresh_token: rt, grant_type: 'refresh_token' })
      if (t.access_token) return json(accessToken(t))
      // Revoked, or expired: Google drops refresh tokens after 7 days while the consent screen is in Testing.
      if (t.error === 'invalid_grant') return json(failure(t), 401, { 'Set-Cookie': cookie(request, '', 0) })
      return json(failure(t), 502)
    }
    case 'signout': {
      const rt = refreshToken(request)
      if (rt) await fetch(REVOKE_URL, { method: 'POST', body: new URLSearchParams({ token: rt }) })
      return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie(request, '', 0) } })
    }
    default:
      return new Response('Not found', { status: 404 })
  }
}
