import { test, expect } from '@playwright/test'
import { apiLogin, signedFormHeaders } from './helpers'

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'dummy-twilio-auth-token-for-test'
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3028'

test.describe('Twilio Webhook（正規署名で検証）', () => {
  test('POST /api/twilio/voice が TwiML を返す', async ({ request }) => {
    await apiLogin(request)
    const projects = await (await request.get('/api/admin/projects')).json()
    const btob = projects.find((p: { shortId: string }) => p.shortId === 'btobap')
    expect(btob).toBeTruthy()

    const started = await request.post(`/api/admin/projects/${btob.id}/preview`, { data: {} })
    const s = await started.json()

    const params: Record<string, string> = {
      CallSid: 'CA_TEST_' + Date.now(),
      From: '+815012345678',
      To: '+818012345678',
      CallStatus: 'in-progress',
    }
    const url = `${BASE_URL}/api/twilio/voice?sessionId=${s.sessionId}`
    const res = await request.post(url, {
      headers: signedFormHeaders(AUTH_TOKEN, url, params),
      form: params,
    })
    expect(res.ok()).toBeTruthy()
    const xml = await res.text()
    expect(xml).toContain('<Response>')
    expect(xml).toMatch(/<Say|<Play|<Gather/)
  })

  test('POST /api/twilio/gather が音声入力を受け付け TwiML を返す', async ({ request }) => {
    await apiLogin(request)
    const projects = await (await request.get('/api/admin/projects')).json()
    const btob = projects.find((p: { shortId: string }) => p.shortId === 'btobap')
    const started = await request.post(`/api/admin/projects/${btob.id}/preview`, { data: {} })
    const s = await started.json()

    const params: Record<string, string> = {
      CallSid: 'CA_TEST_' + Date.now(),
      SpeechResult: '料金について教えてください',
      Confidence: '0.88',
    }
    const url = `${BASE_URL}/api/twilio/gather?sessionId=${s.sessionId}`
    const res = await request.post(url, {
      headers: signedFormHeaders(AUTH_TOKEN, url, params),
      form: params,
    })
    expect(res.ok()).toBeTruthy()
    const xml = await res.text()
    expect(xml).toContain('<Response>')
  })

  test('署名なしの webhook は 403 で拒否される', async ({ request }) => {
    const res = await request.post(`/api/twilio/voice?sessionId=dummy`, {
      form: { CallSid: 'X' },
    })
    expect(res.status()).toBe(403)
  })
})
