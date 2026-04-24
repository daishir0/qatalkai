import { request, expect } from '@playwright/test'

/**
 * Playwright global setup:
 * - Flip `twilio_live_calls_enabled` to false so E2E never places real Twilio calls.
 * - Store the prior value so teardown can restore it.
 */
async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3028'
  const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true })
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
    const login = await ctx.post('/api/auth/login', { data: { email: adminEmail, password: adminPassword } })
    if (!login.ok()) throw new Error('login failed during global setup')

    // Read current value
    const currentRes = await ctx.get('/api/admin/settings')
    const current = currentRes.ok() ? (await currentRes.json()) as Record<string, string> : {}
    process.env.__E2E_PRIOR_TWILIO_LIVE = current.twilio_live_calls_enabled || 'true'

    const put = await ctx.put('/api/admin/settings', {
      data: { twilio_live_calls_enabled: 'false' },
    })
    expect(put.ok()).toBeTruthy()
  } finally {
    await ctx.dispose()
  }
}

export default globalSetup
