import { test, expect } from '@playwright/test'
import { apiLogin, loginAsAdmin } from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe('営業トレーニングモード (API)', () => {
  test('セッション開始・採点・サマリーまで完走する', async ({ request }) => {
    test.setTimeout(120_000)

    const started = await request.post('/api/training/session/start', {
      data: {
        shortId: 'train01',
        traineeName: 'E2E太郎',
        traineeNumber: 'E2E-001',
        questionCount: 1,
      },
    })
    expect(started.ok()).toBeTruthy()
    const startData = await started.json()
    expect(startData.sessionId).toBeTruthy()
    expect(typeof startData.firstQuestion?.text).toBe('string')
    expect(startData.firstQuestion.text.length).toBeGreaterThan(0)
    expect(startData.totalQuestions).toBe(1)
    expect(startData.projectName).toContain('製造業DX')

    const turn = await request.post('/api/training/session/turn', {
      data: {
        sessionId: startData.sessionId,
        editedText:
          'REST API と GraphQL の両対応で、主要 ERP 向けの標準コネクタがあります。導入実績もございます。',
      },
    })
    expect(turn.ok()).toBeTruthy()
    const turnData = await turn.json()
    expect(typeof turnData.evaluation?.score).toBe('number')
    expect(turnData.evaluation.score).toBeGreaterThanOrEqual(0)
    expect(turnData.evaluation.score).toBeLessThanOrEqual(100)
    expect(Array.isArray(turnData.evaluation.goodPoints)).toBeTruthy()
    expect(Array.isArray(turnData.evaluation.improvementPoints)).toBeTruthy()
    expect(typeof turnData.evaluation.modelAnswer).toBe('string')
    expect(turnData.finished).toBeTruthy()
    expect(turnData.summary).toBeTruthy()
    expect(typeof turnData.summary.totalScore).toBe('number')
    expect(typeof turnData.summary.finalFeedback).toBe('string')
  })

  test('questionCount を 2 に上書きすると 2問で完走する', async ({ request }) => {
    test.setTimeout(180_000)

    const started = await request.post('/api/training/session/start', {
      data: {
        shortId: 'train01',
        traineeName: 'E2E花子',
        traineeNumber: 'E2E-002',
        questionCount: 2,
      },
    })
    expect(started.ok()).toBeTruthy()
    const { sessionId, totalQuestions } = await started.json()
    expect(totalQuestions).toBe(2)

    const first = await request.post('/api/training/session/turn', {
      data: { sessionId, editedText: '一回目の回答です。' },
    })
    expect(first.ok()).toBeTruthy()
    const firstData = await first.json()
    expect(firstData.finished).toBeFalsy()
    expect(firstData.next).toBeTruthy()
    expect(typeof firstData.next.text).toBe('string')

    const second = await request.post('/api/training/session/turn', {
      data: { sessionId, editedText: '二回目の回答です。' },
    })
    expect(second.ok()).toBeTruthy()
    const secondData = await second.json()
    expect(secondData.finished).toBeTruthy()
    expect(secondData.summary).toBeTruthy()
  })

  test('非トレーニングモードの shortId を指定すると 400', async ({ request }) => {
    const r = await request.post('/api/training/session/start', {
      data: { shortId: 'btobap', traineeName: 'X', traineeNumber: 'X', questionCount: 1 },
    })
    expect(r.status()).toBe(400)
  })

  test('存在しない shortId を指定すると 400', async ({ request }) => {
    const r = await request.post('/api/training/session/start', {
      data: { shortId: 'nonexistent', traineeName: 'X', traineeNumber: 'X', questionCount: 1 },
    })
    expect(r.status()).toBe(400)
  })

  test('氏名なしで開始すると 400', async ({ request }) => {
    const r = await request.post('/api/training/session/start', {
      data: { shortId: 'train01', traineeName: '', traineeNumber: 'E', questionCount: 1 },
    })
    expect(r.status()).toBe(400)
  })

  test('回答が空だと 400', async ({ request }) => {
    const started = await request.post('/api/training/session/start', {
      data: { shortId: 'train01', traineeName: 'E2Eエッジ', traineeNumber: 'E2E-E', questionCount: 1 },
    })
    const { sessionId } = await started.json()
    const r = await request.post('/api/training/session/turn', {
      data: { sessionId, editedText: '' },
    })
    expect(r.status()).toBe(400)
  })
})

test.describe('営業トレーニングモード (UI: 受講者)', () => {
  test('入場フォーム→回答→評価→総評 を通せる', async ({ page }) => {
    test.setTimeout(180_000)

    await page.goto('/training/train01')
    await expect(page.getByRole('heading', { name: /製造業DX/ })).toBeVisible()
    await page.getByTestId('trainee-name').fill('UI太郎')
    await page.getByTestId('trainee-number').fill('UI-001')
    await page.getByTestId('question-count').fill('1')
    await page.getByTestId('start-training').click()

    const questionText = page.getByTestId('question-text')
    await expect(questionText).toBeVisible({ timeout: 60_000 })
    const qtxt = (await questionText.textContent())?.trim() || ''
    expect(qtxt.length).toBeGreaterThan(0)

    await page.getByTestId('type-answer').click()
    await page
      .getByTestId('edited-text')
      .fill('弊社のAPIは REST/GraphQL 両対応で、SAP・kintone と連携実績があります。標準コネクタも30種類提供しています。')
    await page.getByTestId('submit-answer').click()

    const score = page.getByTestId('score')
    await expect(score).toBeVisible({ timeout: 60_000 })
    const scoreTxt = (await score.textContent())?.trim() || ''
    expect(scoreTxt).toMatch(/\d+\s*\/\s*100/)

    await page.getByTestId('proceed').click()
    await expect(page.getByTestId('total-score')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('final-feedback')).toBeVisible()
  })

  test('非トレーニングモードのプロジェクトは"見つかりません"表示', async ({ page }) => {
    await page.goto('/training/btobap')
    await expect(page.getByRole('heading', { name: 'プロジェクトが見つかりません' })).toBeVisible()
  })

  test('存在しない shortId は"見つかりません"表示', async ({ page }) => {
    await page.goto('/training/nonexistent')
    await expect(page.getByRole('heading', { name: 'プロジェクトが見つかりません' })).toBeVisible()
  })
})

test.describe('営業トレーニングモード (管理画面)', () => {
  test('プロジェクト新規作成で training が選べる', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/projects')
    await page.getByRole('button', { name: '新規作成' }).click()
    const select = page.locator('select').first()
    await expect(select).toBeVisible()
    const options = await select.locator('option').allTextContents()
    expect(options.some((t) => t.includes('training'))).toBeTruthy()
  })

  test('training プロジェクトの詳細→発信タブで公開URLが表示される', async ({ page, request }) => {
    await apiLogin(request)
    const projects = await (await request.get('/api/admin/projects')).json()
    const t1 = projects.find((p: { shortId: string }) => p.shortId === 'train01')
    expect(t1).toBeTruthy()

    await loginAsAdmin(page)
    await page.goto(`/admin/projects/${t1.id}`)
    await expect(page.getByRole('heading', { name: /製造業DX/ })).toBeVisible()
    await page.getByRole('button', { name: '発信', exact: true }).click()
    await expect(page.getByRole('heading', { name: '営業トレーニングモード' })).toBeVisible()
    await expect(page.getByText(/\/training\/train01/)).toBeVisible()
  })

  test('セッション詳細で training ターンが表示される', async ({ page, request }) => {
    test.setTimeout(180_000)
    await apiLogin(request)

    const started = await request.post('/api/training/session/start', {
      data: { shortId: 'train01', traineeName: '管理画面確認用', traineeNumber: 'ADM-001', questionCount: 1 },
    })
    const { sessionId } = await started.json()
    await request.post('/api/training/session/turn', {
      data: { sessionId, editedText: '管理画面確認用の回答です。要点を簡潔に述べます。' },
    })

    await loginAsAdmin(page)
    await page.goto(`/admin/sessions/${sessionId}`)
    await expect(page.getByText('モード: training')).toBeVisible()
    await expect(page.getByText(/受講者:/)).toBeVisible()
    await expect(page.getByTestId('admin-total-score')).toBeVisible({ timeout: 30_000 })
  })
})
