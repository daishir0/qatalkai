import { test, expect } from '@playwright/test'
import { loginAsAdmin, apiLogin } from './helpers'

test.describe('プロジェクト管理', () => {
  test('プロジェクト一覧を表示できる', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/projects')
    await expect(page.getByRole('heading', { name: 'プロジェクト' })).toBeVisible()
    await expect(page.getByText('BtoBアポ獲得トーク（デモ）')).toBeVisible()
    await expect(page.getByText('AI勤怠管理システム')).toBeVisible()
  })

  test('プロジェクトを作成・削除できる', async ({ page, request }) => {
    await apiLogin(request)
    const name = `E2E-${Date.now()}`
    const created = await request.post('/api/admin/projects', {
      data: { name, description: 'e2e', defaultMode: 'phone' },
    })
    expect(created.ok()).toBeTruthy()
    const project = await created.json()

    await loginAsAdmin(page)
    await page.goto('/admin/projects')
    await expect(page.getByText(name)).toBeVisible()

    const del = await request.delete(`/api/admin/projects/${project.id}`)
    expect(del.ok()).toBeTruthy()
  })

  test('プロジェクト詳細のタブが切り替わる', async ({ page, request }) => {
    await apiLogin(request)
    const res = await request.get('/api/admin/projects')
    const projects = await res.json()
    const btob = projects.find((p: { shortId: string }) => p.shortId === 'btobap')
    expect(btob).toBeTruthy()

    await loginAsAdmin(page)
    await page.goto(`/admin/projects/${btob.id}`)
    await expect(page.getByRole('heading', { name: 'BtoBアポ獲得トーク（デモ）' })).toBeVisible()

    await page.click('button:has-text("QA")')
    await expect(page.getByPlaceholder('質問')).toBeVisible()

    await page.click('button:has-text("リード")')
    await expect(page.getByPlaceholder('電話番号')).toBeVisible()

    await page.click('button:has-text("発信"):not(:has-text("/"))').catch(async () => {
      // フォールバック: タブラベル「発信」
      await page.getByRole('button', { name: '発信', exact: true }).click()
    })
    await expect(page.getByRole('heading', { name: /電話モード/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '全リードへ発信' })).toBeVisible()
  })

  test('web プロジェクトでは QR が表示される', async ({ page, request }) => {
    await apiLogin(request)
    const projects = await (await request.get('/api/admin/projects')).json()
    const kintai = projects.find((p: { shortId: string }) => p.shortId === 'kintai')
    expect(kintai).toBeTruthy()
    await loginAsAdmin(page)
    await page.goto(`/admin/projects/${kintai.id}`)
    await page.getByRole('button', { name: '発信', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Web 公開モード' })).toBeVisible()
    await expect(page.locator('img[alt="QR"]')).toBeVisible()
  })
})
