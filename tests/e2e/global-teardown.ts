import { request } from '@playwright/test'

async function globalTeardown() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3028'
  const ctx = await request.newContext({ baseURL, ignoreHTTPSErrors: true })
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
    const login = await ctx.post('/api/auth/login', { data: { email: adminEmail, password: adminPassword } })
    if (!login.ok()) return
    const prior = process.env.__E2E_PRIOR_TWILIO_LIVE || 'true'
    await ctx.put('/api/admin/settings', { data: { twilio_live_calls_enabled: prior } })
  } finally {
    await ctx.dispose()
  }
}

export default globalTeardown
