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

    if (request.method === 'GET' && url.pathname === '/preview') {
      return handlePreview(request, env, url)
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

async function handlePreview(request: Request, env: Env, url: URL): Promise<Response> {
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

  const target = String(url.searchParams.get('url') || '').trim()
  if (!isAllowedSheinUrl(target)) return json({ error: 'URL is not allowed' }, request, env, 400)

  // Serve from cache when we've unfurled this exact link before.
  const cacheKey = `preview:${await sha256Hex(target)}`
  const cached = await env.CACHE_KV.get(cacheKey)
  if (cached) return new Response(cached, { headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' } })

  if (!(await takeRateLimit(env, uid))) return json({ error: 'Too many requests' }, request, env, 429)

  const preview = await fetchLinkPreview(target)
  const body = JSON.stringify(preview)
  await env.CACHE_KV.put(cacheKey, body, { expirationTtl: 604800 })
  return new Response(body, { headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' } })
}

function isAllowedSheinUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const host = parsed.hostname.toLowerCase()
    return host === 'shein.com' || host.endsWith('.shein.com')
  } catch {
    return false
  }
}

async function fetchLinkPreview(target: string): Promise<{ image: string; title: string }> {
  try {
    const res = await fetch(target, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+https://krljde.github.io)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return { image: '', title: '' }
    const html = await res.text()
    const rawImage = metaContent(html, 'og:image') || metaContent(html, 'twitter:image')
    const title = metaContent(html, 'og:title') || metaContent(html, 'twitter:title')
    let image = ''
    if (rawImage) {
      try { image = new URL(rawImage, res.url || target).toString() } catch { image = '' }
    }
    return { image, title: decodeEntities(title) }
  } catch {
    return { image: '', title: '' }
  }
}

// Pull a meta tag's content for og:/twitter: keys, regardless of attribute order.
function metaContent(html: string, key: string): string {
  const head = html.slice(0, 200000)
  const attr = `(?:property|name)\\s*=\\s*["']${key.replace(':', '\\:')}["']`
  const patterns = [
    new RegExp(`<meta[^>]+${attr}[^>]+content\\s*=\\s*["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]+${attr}`, 'i'),
  ]
  for (const re of patterns) {
    const match = head.match(re)
    if (match && match[1]) return match[1].trim()
  }
  return ''
}

function decodeEntities(value: string): string {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
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
  // Return the newest code within a 12h window so it's never a stale one from an
  // earlier binding to the same dot variant. Restrict to SHEIN's transactional sender
  // (screenshots confirm every code comes from noreply@sheinnotice.com). Gmail's
  // `newer_than:` is day/month-only, so bound the query with an epoch `after:` and
  // enforce the exact window via internalDate.
  const WINDOW_MS = 12 * 60 * 60 * 1000
  const cutoffSec = Math.floor((Date.now() - WINDOW_MS) / 1000)
  listUrl.searchParams.set('q', `from:sheinnotice.com after:${cutoffSec}`)
  listUrl.searchParams.set('maxResults', '50')

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`)
  const list = (await listRes.json()) as GmailListResponse
  const messages = list.messages ?? []

  // Messages are newest-first; return the most recent one delivered to THIS exact
  // dot variant, so concurrent bookers' codes never cross over.
  for (const { id } of messages) {
    const messageRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!messageRes.ok) throw new Error(`Gmail message fetch failed: ${messageRes.status}`)
    const message = (await messageRes.json()) as GmailMessage
    // Newest-first: once we pass the 5-minute boundary, everything after is older too.
    if (message.internalDate && Number(message.internalDate) < Date.now() - WINDOW_MS) break
    if (!recipientMatches(message, address)) continue
    if (!fromIsShein(message)) continue

    const parsed = parseGmailMessage(message.payload)
    const code = extractSixDigitCode(parsed.bodyText) || extractOtp(parsed.bodyText)
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

// SHEIN sends verification codes from its transactional domain (e.g.
// noreply@sheinnotice.com). Marketing/EDM blasts come from *.sheinemail.com and
// also contain "shein" plus stray 6-digit numbers (promo IDs), so without this
// exclusion a recent promo shadows the real binding OTP and the booker gets a
// code that won't bind.
function fromIsShein(message: GmailMessage): boolean {
  const headers = message.payload.headers ?? []
  const rawFrom = findGmailHeader(headers, 'From')
  if (!decodeMimeHeader(rawFrom).toLowerCase().includes('shein')) return false
  const domain = (extractHeaderEmail(rawFrom).split('@')[1] || '').toLowerCase()
  if (domain === 'sheinemail.com' || domain.endsWith('.sheinemail.com')) return false
  return true
}

function extractSixDigitCode(bodyText: string): string {
  const match = String(bodyText || '').match(/\b(?!0{6}\b)\d{6}\b/)
  return match ? match[0] : ''
}

// Match the EXACT dot variant currently being surrendered. Gmail keeps the literal
// recipient in Delivered-To and/or To, so check both (and every address within, for
// multi-recipient headers) for a dot-for-dot equality against the generated email.
function recipientMatches(message: GmailMessage, address: string): boolean {
  const headers = message.payload.headers ?? []
  const target = address.toLowerCase()
  for (const name of ['Delivered-To', 'To', 'Cc']) {
    const raw = findGmailHeader(headers, name)
    if (!raw) continue
    const emails: string[] = decodeMimeHeader(raw).toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []
    if (emails.includes(target)) return true
  }
  return false
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
