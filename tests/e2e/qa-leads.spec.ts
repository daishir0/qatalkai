import { test, expect } from '@playwright/test'
import { apiLogin } from './helpers'

test.describe('QA・リード管理 API', () => {
  let projectId: string

  test.beforeAll(async ({ request }) => {
    await apiLogin(request)
    const r = await request.post('/api/admin/projects', {
      data: { name: `E2E-QA-${Date.now()}`, defaultMode: 'phone' },
    })
    expect(r.ok()).toBeTruthy()
    const p = await r.json()
    projectId = p.id
  })

  test.afterAll(async ({ request }) => {
    await apiLogin(request)
    await request.delete(`/api/admin/projects/${projectId}`)
  })

  test('QAを追加・一覧取得・削除できる', async ({ request }) => {
    await apiLogin(request)

    const add = await request.post(`/api/admin/projects/${projectId}/qa`, {
      data: { question: '営業時間は？', answer: '平日9時から18時です。' },
    })
    expect(add.ok()).toBeTruthy()
    const qa = await add.json()

    const list = await request.get(`/api/admin/projects/${projectId}/qa`)
    const items = await list.json()
    expect(items.some((i: { id: string }) => i.id === qa.id)).toBeTruthy()

    const del = await request.delete(`/api/admin/projects/${projectId}/qa/${qa.id}`)
    expect(del.ok()).toBeTruthy()
  })

  test('リードを追加・削除できる', async ({ request }) => {
    await apiLogin(request)

    const add = await request.post(`/api/admin/projects/${projectId}/leads`, {
      data: { phoneNumber: '09012345678', displayName: 'E2E太郎' },
    })
    expect(add.ok()).toBeTruthy()
    const lead = await add.json()

    const list = await request.get(`/api/admin/projects/${projectId}/leads`)
    const leads = await list.json()
    expect(leads.some((l: { id: string }) => l.id === lead.id)).toBeTruthy()

    const del = await request.delete(`/api/admin/projects/${projectId}/leads/${lead.id}`)
    expect(del.ok()).toBeTruthy()
  })
})
