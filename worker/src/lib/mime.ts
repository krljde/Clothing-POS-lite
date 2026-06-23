// Shared MIME/body decoding helpers used by both the Cloudflare Email
// Routing handler (raw RFC822) and the Gmail API path (structured JSON).

export type ParsedEmail = {
  subject: string
  fromAddress: string
  toAddress: string
  bodyText: string
  bodyHtml: string
}

// ── Raw MIME (RFC822) parsing — used by Cloudflare Email Routing ──

export function parseEmail(raw: string): ParsedEmail {
  const { headers, body } = splitHeadersBody(raw)
  const subject = decodeMimeHeader(getHeader(headers, 'subject'))
  const fromAddress = decodeMimeHeader(getHeader(headers, 'from'))
  const toAddress = decodeMimeHeader(getHeader(headers, 'to'))
  const contentType = getHeader(headers, 'content-type') || 'text/plain'
  const encoding = getHeader(headers, 'content-transfer-encoding') || '7bit'

  const parts = extractParts(body, contentType, encoding)
  return {
    subject,
    fromAddress,
    toAddress,
    bodyText: parts.text,
    bodyHtml: parts.html,
  }
}

function splitHeadersBody(raw: string): { headers: string; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n')
  const sepIdx = normalized.indexOf('\n\n')
  if (sepIdx === -1) return { headers: normalized, body: '' }
  return { headers: normalized.slice(0, sepIdx), body: normalized.slice(sepIdx + 2) }
}

function getHeader(headers: string, name: string): string {
  const unfolded = headers.replace(/\n[ \t]+/g, ' ')
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im')
  const match = unfolded.match(re)
  return match ? match[1].trim() : ''
}

function getBoundary(contentType: string): string {
  const match = contentType.match(/boundary\s*=\s*"?([^";\s]+)"?/i)
  return match ? match[1] : ''
}

function extractParts(
  body: string,
  contentType: string,
  encoding: string,
): { text: string; html: string } {
  const ctLower = contentType.toLowerCase()
  const boundary = getBoundary(contentType)

  if (boundary) {
    const segments = body.split(`--${boundary}`)
    let text = ''
    let html = ''
    for (const seg of segments) {
      if (!seg.trim() || seg.trim() === '--') continue
      const { headers: partHeaders, body: partBody } = splitHeadersBody(seg.replace(/^\n+/, ''))
      const partCt = getHeader(partHeaders, 'content-type') || 'text/plain'
      const partEnc = getHeader(partHeaders, 'content-transfer-encoding') || '7bit'
      const partCtLower = partCt.toLowerCase()

      if (partCtLower.includes('multipart/')) {
        const nested = extractParts(partBody, partCt, partEnc)
        if (!text && nested.text) text = nested.text
        if (!html && nested.html) html = nested.html
      } else if (partCtLower.includes('text/html') && !html) {
        html = decodeBody(partBody.trim(), partEnc)
      } else if (partCtLower.includes('text/plain') && !text) {
        text = decodeBody(partBody.trim(), partEnc)
      }
    }
    return { text, html }
  }

  const decoded = decodeBody(body.trim(), encoding)
  if (ctLower.includes('text/html')) {
    return { text: stripHtml(decoded), html: decoded }
  }
  return { text: decoded, html: '' }
}

// ── Gmail API structured parsing ──

type GmailHeader = { name: string; value: string }
type GmailPart = {
  mimeType?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}
type GmailPayload = GmailPart & {
  headers?: GmailHeader[]
}

export function parseGmailMessage(payload: GmailPayload): ParsedEmail {
  const headers = payload.headers ?? []
  const subject = decodeMimeHeader(findHeader(headers, 'Subject'))
  const fromAddress = decodeMimeHeader(findHeader(headers, 'From'))
  const toAddress = decodeMimeHeader(findHeader(headers, 'To'))

  const parts = walkGmailParts(payload)
  return {
    subject,
    fromAddress,
    toAddress,
    bodyText: parts.text,
    bodyHtml: parts.html,
  }
}

function findHeader(headers: GmailHeader[], name: string): string {
  const needle = name.toLowerCase()
  for (const h of headers) {
    if (h.name.toLowerCase() === needle) return h.value
  }
  return ''
}

function walkGmailParts(part: GmailPart): { text: string; html: string } {
  let text = ''
  let html = ''

  const visit = (p: GmailPart) => {
    const mt = (p.mimeType ?? '').toLowerCase()
    if (p.parts && p.parts.length > 0) {
      for (const sub of p.parts) visit(sub)
      return
    }
    const data = p.body?.data
    if (!data) return
    const decoded = decodeBase64Url(data)
    if (mt === 'text/html' && !html) html = decoded
    else if (mt === 'text/plain' && !text) text = decoded
  }

  visit(part)

  // Fallback: if only HTML came through, derive a text version for OTP extraction.
  if (!text && html) text = stripHtml(html)
  return { text, html }
}

// ── Body decoders ──

export function decodeBody(body: string, encoding: string): string {
  const enc = encoding.toLowerCase().trim()
  if (enc === 'quoted-printable') return decodeQuotedPrintable(body)
  if (enc === 'base64') return decodeBase64(body)
  return body
}

export function decodeQuotedPrintable(input: string): string {
  const joined = input.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i]
    if (ch === '=' && i + 2 < joined.length) {
      const hex = joined.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16))
        i += 2
        continue
      }
    }
    bytes.push(ch.charCodeAt(0))
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
}

export function decodeBase64(input: string): string {
  try {
    const cleaned = input.replace(/\s+/g, '')
    const binary = atob(cleaned)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return input
  }
}

export function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4
  const fully = pad ? padded + '='.repeat(4 - pad) : padded
  return decodeBase64(fully)
}

export function decodeMimeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, _charset, enc, text) => {
    try {
      if (enc.toUpperCase() === 'B') {
        return decodeBase64(text)
      }
      return decodeQuotedPrintable(text.replace(/_/g, ' '))
    } catch {
      return text
    }
  })
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── OTP extraction (shared) ──

export const OTP_REGEX = /\b\d{4,8}\b/g

export function extractOtp(bodyText: string): string | null {
  const matches = bodyText.match(OTP_REGEX) ?? []
  const valid = matches.find((m) => !/^0+$/.test(m))
  return valid ?? null
}
