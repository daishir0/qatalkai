import Twilio from 'twilio'
import { getSetting } from './settings'

let cachedClient: Twilio.Twilio | null = null
let cachedSid: string | null = null

export async function getTwilioClient(): Promise<Twilio.Twilio> {
  const accountSid = await getSetting('twilio_account_sid')
  const authToken = await getSetting('twilio_auth_token')

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured. Set twilio_account_sid and twilio_auth_token in Settings.')
  }

  // Invalidate cache if credentials changed
  if (!cachedClient || cachedSid !== accountSid) {
    cachedClient = Twilio(accountSid, authToken)
    cachedSid = accountSid
  }
  return cachedClient
}

export async function getTwilioPhoneNumber(): Promise<string> {
  const phoneNumber = await getSetting('twilio_phone_number')
  if (!phoneNumber) {
    throw new Error('Twilio phone number not configured. Set twilio_phone_number in Settings.')
  }
  return phoneNumber
}

export function clearTwilioCache(): void {
  cachedClient = null
}

export async function validateTwilioRequest(
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  const authToken = await getSetting('twilio_auth_token')
  if (!authToken) return false
  return Twilio.validateRequest(authToken, signature, url, params)
}

/**
 * Validate an incoming Twilio webhook request using X-Twilio-Signature.
 *
 * Reconstructs the URL that Twilio signed using the request's own headers
 * (X-Forwarded-Proto / X-Forwarded-Host / Host), which is what Apache
 * forwards when ProxyPreserveHost is on. This works both behind the
 * production reverse proxy and in local E2E where tests POST directly.
 */
export async function validateTwilioWebhook(req: Request, formParams: Record<string, string>): Promise<boolean> {
  const signature = req.headers.get('x-twilio-signature')
  if (!signature) return false

  const url = new URL(req.url)
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    url.host
  // Next.js populates X-Forwarded-Proto with the internal hop's protocol (http),
  // which is unreliable behind a TLS-terminating reverse proxy. Derive proto from
  // host: a public domain implies https, localhost implies http.
  const isLocal = /^(localhost|127\.|::1)/.test(host)
  const proto = isLocal ? 'http' : 'https'
  const fullUrl = `${proto}://${host}${url.pathname}${url.search}`

  const valid = await validateTwilioRequest(signature, fullUrl, formParams)
  if (!valid) {
    console.error('[twilio] Webhook signature invalid', {
      reconstructedUrl: fullUrl,
      signature,
      host,
      xForwardedHost: req.headers.get('x-forwarded-host'),
      xForwardedProto: req.headers.get('x-forwarded-proto'),
      paramKeys: Object.keys(formParams).sort(),
    })
  }
  return valid
}
