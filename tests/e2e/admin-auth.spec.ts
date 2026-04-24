import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

test.describe('管理者認証', () => {
  test('ログインページが表示される', async ({ page }) => {
    await page.goto('/admin/login')
    await expect(page.locator('h1')).toContainText('管理画面ログイン')
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('不正な認証情報でログイン失敗', async ({ page }) => {
    await page.goto('/admin/login')
    await page.fill('#email', 'wrong')
    await page.fill('input[type="password"]', 'wrong')
    await page.click('button[type="submit"]')
    await expect(page.getByText('メールアドレスまたはパスワードが正しくありません')).toBeVisible()
  })

  test('正しい認証情報でログイン成功', async ({ page }) => {
    await page.goto('/admin/login')
    await page.fill('#email', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/admin', { timeout: 20000 })
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible()
  })

  test('未認証で管理画面にアクセスするとログインにリダイレクト', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL('/admin/login', { timeout: 15000 })
  })

  test('ログアウトできる', async ({ page }) => {
    await page.goto('/admin/login')
    await page.fill('#email', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/admin', { timeout: 20000 })
    await page.click('text=ログアウト')
    await expect(page).toHaveURL('/admin/login', { timeout: 15000 })
  })
})
