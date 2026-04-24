import { test, expect } from '@playwright/test'
import { apiLogin } from './helpers'

test.describe('単発発信 API と QR API', () => {
  test('1 リードを選択発信するとセッションが生成される（test_mode）', async ({ request }) => {
    await apiLogin(request)
    const projects = await (await request.get('/api/admin/projects')).json()
    const btob = projects.find((p: { shortId: string }) => p.shortId === 'btobap')
    expect(btob).toBeTruthy()

    // Pick first lead with phoneNumber
    const leads = await (await request.get(`/api/admin/projects/${btob.id}/leads`)).json()
    const lead = leads.find((l: { phoneNumber: string | null }) => l.phoneNumber)
    expect(lead).toBeTruthy()

    const res = await request.post(`/api/admin/projects/${btob.id}/leads/${lead.id}/call`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.status).toBe('COMPLETED')
  })

  test('GET /api/admin/projects/[id]/qr が DataURL を返す', async ({ request }) => {
    await apiLogin(request)
    const projects = await (await request.get('/api/admin/projects')).json()
    const kintai = projects.find((p: { shortId: string }) => p.shortId === 'kintai')
    expect(kintai).toBeTruthy()
    const res = await request.get(`/api/admin/projects/${kintai.id}/qr`)
    expect(res.ok()).toBeTruthy()
    const data = await res.json()
    expect(data.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    expect(data.url).toContain('/q/kintai')
  })
})
