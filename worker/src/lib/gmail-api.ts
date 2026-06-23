import type { Env } from '../index'

type AccessTokenResponse = {
  access_token: string
  expires_in: number
  token_type: string
  scope?: string
  refresh_token?: string
}

export async function exchangeRefreshToken(
  env: Env,
  refreshToken: string
): Promise<AccessTokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gmail refresh failed: ${res.status} ${text}`)
  }
  return (await res.json()) as AccessTokenResponse
}

export async function getBaseAccessToken(env: Env): Promise<string> {
  const cacheKey = 'gmail_access:base'
  const cached = await env.CACHE_KV.get(cacheKey)
  if (cached) return cached

  const token = await exchangeRefreshToken(env, env.GMAIL_REFRESH_TOKEN)
  const ttl = Math.max(60, token.expires_in - 60)
  await env.CACHE_KV.put(cacheKey, token.access_token, { expirationTtl: ttl })
  return token.access_token
}

export function gmailCanonical(address: string): string {
  const [local] = address.toLowerCase().split('@')
  return local.replace(/\./g, '')
}
