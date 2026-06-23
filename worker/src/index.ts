import { verifyFirebaseIdToken } from './lib/firebase-verify'
import { getBaseAccessToken, gmailCanonical } from './lib/gmail-api'
import { decodeMimeHeader, extractOtp, parseGmailMessage } from './lib/mime'

export interface Env {
  CACHE_KV: KVNamespace
  GMAIL_BASE: string
  FIREBASE_PROJECT_ID: string
  FRONTEND_ORIGIN: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GMAIL_REFRESH_TOKEN: string
}

type GmailListResponse = {
  messages?: Array<{ id: string }>
}

type GmailHeader = {
  name: string
  value: string
}

type GmailMessage = {
  id: string
  internalDate?: string
  payload: Parameters<typeof parseGmailMessage>[0] & { headers?: GmailHeader[] }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request, env) })

    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ status: 'ok' }, request, env)
    }

    if (request.method === 'GET' && url.pathname === '/code') {
      return handleCode(request, env, url)
    }

    return json({ error: 'Not found' }, request, env, 404)
  },
}

async function handleCode(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : ''
  if (!token) return json({ error: 'Unauthorized' }, request, env, 401)

  let uid = ''
  try {
    const payload = await verifyFirebaseIdToken(token, env)
    uid = payload.uid
  } catch {
    return json({ error: 'Unauthorized' }, request, env, 401)
  }

  const address = String(url.searchParams.get('address') || '').trim().toLowerCase()
  if (!address || gmailCanonical(address) !== gmailCanonical(env.GMAIL_BASE)) {
    return json({ error: 'Address is not allowed' }, request, env, 400)
  }

  if (!(await takeRateLimit(env, uid))) return json({ error: 'Too many requests' }, request, env, 429)

  const result = await fetchLatestCode(env, address)
  return json(result, request, env)
}

async function takeRateLimit(env: Env, uid: string): Promise<boolean> {
  const windowSeconds = 300
  const limit = 20
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000))
  const key = `rate:${uid}:${bucket}`
  const current = Number(await env.CACHE_KV.get(key) || '0')
  if (current >= limit) return false
  await env.CACHE_KV.put(key, String(current + 1), { expirationTtl: windowSeconds })
  return true
}

async function fetchLatestCode(env: Env, address: string): Promise<{ code: string | null; subject?: string; from?: string; receivedAt?: string }> {
  const accessToken = await getBaseAccessToken(env)
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('q', `deliveredto:${address} newer_than:1d`)
  listUrl.searchParams.set('maxResults', '10')

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`)
  const list = (await listRes.json()) as GmailListResponse
  const messages = list.messages ?? []

  for (const { id } of messages) {
    const messageRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!messageRes.ok) throw new Error(`Gmail message fetch failed: ${messageRes.status}`)
    const message = (await messageRes.json()) as GmailMessage
    if (!deliveredToMatches(message, address)) continue

    const parsed = parseGmailMessage(message.payload)
    const code = extractOtp(parsed.bodyText)
    if (!code) continue

    return {
      code,
      subject: parsed.subject,
      from: parsed.fromAddress,
      receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : undefined,
    }
  }

  return { code: null }
}

function deliveredToMatches(message: GmailMessage, address: string): boolean {
  const headers = message.payload.headers ?? []
  const deliveredTo = findGmailHeader(headers, 'Delivered-To') || findGmailHeader(headers, 'To')
  if (!deliveredTo) return false
  return extractHeaderEmail(deliveredTo) === address.toLowerCase()
}

function findGmailHeader(headers: GmailHeader[], name: string): string {
  const needle = name.toLowerCase()
  for (const header of headers) {
    if (header.name.toLowerCase() === needle) return header.value
  }
  return ''
}

function extractHeaderEmail(value: string): string {
  const decoded = decodeMimeHeader(value).trim().toLowerCase()
  const angleMatch = decoded.match(/<([^<>]+)>/)
  const candidate = (angleMatch ? angleMatch[1] : decoded).trim()
  const emailMatch = candidate.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)
  return (emailMatch ? emailMatch[0] : candidate).toLowerCase()
}

function json(data: unknown, request: Request, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json',
    },
  })
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || ''
  const allowed = origin === env.FRONTEND_ORIGIN || /^http:\/\/localhost(?::\d+)?$/.test(origin)
  return {
    'Access-Control-Allow-Origin': allowed ? origin : env.FRONTEND_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization',
    'Vary': 'Origin',
  }
}
