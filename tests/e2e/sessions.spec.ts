import { test, expect } from '@playwright/test'
import { apiLogin, loginAsAdmin } from './helpers'

test.describe('セッション閲覧', () => {
  test('APIで Web セッションを作成し管理画面で閲覧できる', async ({ page, request }) => {
    // Create a web session via public API
    const s = await request.post('/api/web/session/start', {
      data: { shortId: 'btobap', mode: 'web' },
    })
    expect(s.ok()).toBeTruthy()
    const data = await s.json()

    // Send a few turns so we accumulate ConversationTurn records
    await request.post('/api/web/session/turn', {
      data: { sessionId: data.sessionId, text: '料金はどれくらいですか？' },
    })
    await request.post('/api/web/session/turn', {
      data: { sessionId: data.sessionId, dtmf: '1' },
    })

    await apiLogin(request)
    const listRes = await request.get('/api/admin/sessions')
    const list = await listRes.json()
    expect(list.some((row: { id: string }) => row.id === data.sessionId)).toBeTruthy()

    const detail = await request.get(`/api/admin/sessions/${data.sessionId}`)
    const d = await detail.json()
    expect(Array.isArray(d.turns)).toBeTruthy()
    expect(d.turns.length).toBeGreaterThan(0)

    // Admin UI
    await loginAsAdmin(page)

    await page.goto('/admin/sessions')
    await expect(page.getByRole('heading', { name: 'セッション一覧' })).toBeVisible()
  })
})
