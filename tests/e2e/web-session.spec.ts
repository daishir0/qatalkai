import { test, expect } from '@playwright/test'
import { apiLogin, loginAsAdmin } from './helpers'

test.describe('Web セッション（API レベル）', () => {
  test('Webモードは空 segments でセッション開始（askPrompt は UI ヒント）', async ({ request }) => {
    const started = await request.post('/api/web/session/start', {
      data: { shortId: 'btobap', mode: 'web' },
    })
    expect(started.ok()).toBeTruthy()
    const data = await started.json()
    expect(data.sessionId).toBeTruthy()
    // A-1: web モードは初手で TTS 再生せず即録音させるため、segments は空
    expect(Array.isArray(data.segments)).toBeTruthy()
    expect(data.segments.length).toBe(0)
    // UI 用の askPrompt 文字列は返ってくる
    expect(typeof data.askPrompt).toBe('string')

    // ユーザー質問を送ると確認プロンプトが返る
    const next = await request.post('/api/web/session/turn', {
      data: { sessionId: data.sessionId, text: '料金はどれくらいですか？' },
    })
    expect(next.ok()).toBeTruthy()
    const nextData = await next.json()
    expect(Array.isArray(nextData.segments)).toBeTruthy()
    const prompt = nextData.segments.find((s: { kind: string }) => s.kind === 'prompt')
    expect(prompt).toBeTruthy()
    // A-4: variant が含まれる（confirm_q または rephrase）
    expect(['confirm_q', 'rephrase']).toContain(prompt.variant)
    // A-2: confirm_q なら候補カウント情報が乗る
    if (prompt.variant === 'confirm_q') {
      expect(typeof prompt.candidateTotal).toBe('number')
      expect(typeof prompt.candidateIndex).toBe('number')
      expect(Array.isArray(prompt.allCandidates)).toBeTruthy()
      expect(prompt.allCandidates.length).toBeGreaterThan(0)
      // A-3: 元の質問が含まれる
      expect(typeof prompt.relatedQaQuestion).toBe('string')
    }
  })

  test('電話モードのプレビューは greeting / pitch から始まる', async ({ request }) => {
    await apiLogin(request)
    const projects = await (await request.get('/api/admin/projects')).json()
    const btob = projects.find((p: { shortId: string }) => p.shortId === 'btobap')
    expect(btob).toBeTruthy()
    const r = await request.post(`/api/admin/projects/${btob.id}/preview`, { data: {} })
    expect(r.ok()).toBeTruthy()
    const d = await r.json()
    expect(d.sessionId).toBeTruthy()
    // phoneFlow は greeting (say) から始まる
    const firstSay = d.segments.find((s: { kind: string; text?: string }) => s.kind === 'say')
    expect(firstSay).toBeTruthy()
    expect(firstSay.text).toMatch(/お世話|お忙しい|こんにちは/)
  })

  test('プレビュー開始は認証が必要', async ({ request }) => {
    const r = await request.post('/api/admin/projects/xxxx/preview', { data: {} })
    expect(r.status()).toBe(401)
  })
})

test.describe('公開 Web ページ', () => {
  test('/q/btobap に voicebot 風マイクボタンが表示される', async ({ page }) => {
    await page.goto('/q/btobap')
    await expect(page.getByRole('heading', { name: 'BtoBアポ獲得トーク（デモ）' })).toBeVisible()
    // voicebot 風: 中央の大きなマイクボタン
    await expect(page.getByRole('button', { name: /について質問する/ })).toBeVisible()
  })

  test('/preview/btobap は管理ログイン経由でアクセスできる', async ({ page }) => {
    await loginAsAdmin(page)

    await page.goto('/preview/btobap')
    await expect(page.getByRole('heading', { name: /\[体感\]/ })).toBeVisible()
  })
})
