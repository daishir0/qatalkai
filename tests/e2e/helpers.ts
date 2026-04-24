import { APIRequestContext, Page, expect } from '@playwright/test'
import crypto from 'crypto'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

export async function loginAsAdmin(page: Page) {
  await page.goto('/admin/login')
  await page.fill('#email', ADMIN_EMAIL)
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('/admin', { timeout: 20000 })
}

export async function apiLogin(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(res.ok()).toBeTruthy()
}

/**
 * Generates a valid X-Twilio-Signature header for the given URL and form params.
 * Twilio signing algorithm: HMAC-SHA1(authToken, url + sorted(k + v for each param)).
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const k of sortedKeys) data += k + params[k]
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

export function signedFormHeaders(authToken: string, url: string, params: Record<string, string>) {
  return { 'X-Twilio-Signature': twilioSignature(authToken, url, params) }
}
