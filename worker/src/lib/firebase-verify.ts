import type { Env } from '../index'

export type FirebasePayload = {
  iss: string
  aud: string
  exp: number
  sub: string
  uid: string
  [key: string]: unknown
}

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
const CERTS_CACHE_KEY = 'firebase_certs:x509'

export async function verifyFirebaseIdToken(token: string, env: Env): Promise<FirebasePayload> {
  const [headerPart, payloadPart, signaturePart] = token.split('.')
  if (!headerPart || !payloadPart || !signaturePart) throw new Error('Malformed token')

  const header = JSON.parse(decodeBase64UrlText(headerPart)) as { alg?: string; kid?: string }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported token header')

  const certs = await getFirebaseCerts(env)
  const cert = certs[header.kid]
  if (!cert) throw new Error('Unknown token key')

  const key = await importCertificateKey(cert)
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    decodeBase64UrlBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  )
  if (!verified) throw new Error('Invalid token signature')

  const payload = JSON.parse(decodeBase64UrlText(payloadPart)) as FirebasePayload
  const now = Math.floor(Date.now() / 1000)
  if (payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) throw new Error('Invalid token issuer')
  if (payload.aud !== env.FIREBASE_PROJECT_ID) throw new Error('Invalid token audience')
  if (!payload.sub) throw new Error('Missing token subject')
  if (payload.exp <= now) throw new Error('Expired token')
  payload.uid = payload.sub
  return payload
}

async function getFirebaseCerts(env: Env): Promise<Record<string, string>> {
  const cached = await env.CACHE_KV.get<Record<string, string>>(CERTS_CACHE_KEY, 'json')
  if (cached) return cached

  const res = await fetch(CERTS_URL)
  if (!res.ok) throw new Error(`Firebase cert fetch failed: ${res.status}`)
  const certs = (await res.json()) as Record<string, string>
  await env.CACHE_KV.put(CERTS_CACHE_KEY, JSON.stringify(certs), { expirationTtl: 43200 })
  return certs
}

async function importCertificateKey(pem: string): Promise<CryptoKey> {
  const certDer = pemToBytes(pem)
  const spki = extractSubjectPublicKeyInfo(certDer)
  return crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )
}

function decodeBase64UrlText(value: string): string {
  return new TextDecoder().decode(decodeBase64UrlBytes(value))
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4
  const base64 = pad ? padded + '='.repeat(4 - pad) : padded
  const binary = atob(base64)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, '')
  const binary = atob(base64)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

function extractSubjectPublicKeyInfo(cert: Uint8Array): Uint8Array {
  const certificate = readDerNode(cert, 0)
  const tbs = readDerNode(cert, certificate.valueStart)
  let offset = tbs.valueStart
  let node = readDerNode(cert, offset)
  if (node.tag === 0xa0) {
    offset = node.end
  }
  for (let i = 0; i < 5; i++) {
    node = readDerNode(cert, offset)
    offset = node.end
  }
  const spki = readDerNode(cert, offset)
  return cert.slice(spki.start, spki.end)
}

function readDerNode(bytes: Uint8Array, start: number): { tag: number; start: number; valueStart: number; end: number } {
  let offset = start
  const tag = bytes[offset++]
  let length = bytes[offset++]
  if (length & 0x80) {
    const count = length & 0x7f
    length = 0
    for (let i = 0; i < count; i++) length = (length << 8) | bytes[offset++]
  }
  return { tag, start, valueStart: offset, end: offset + length }
}
