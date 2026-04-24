import { getOpenAIClient } from './openai'
import { getSettings } from './settings'
import { prisma } from './prisma'

export interface QaCandidate {
  id: string
  question: string
  answer: string
}

export interface QaMatchResult {
  logic: number
  candidates: QaCandidate[]
  directAnswer?: string
}

export async function matchQuestion(projectId: string, questionText: string): Promise<QaMatchResult> {
  const settings = await getSettings(['answer_logic', 'gpt_model'])
  const logic = parseInt(settings.answer_logic || '2')
  const model = settings.gpt_model || 'gpt-4o-mini'

  if (logic === 1) return directAnswer(projectId, questionText, model)
  if (logic === 3) return fullQaMatch(projectId, questionText, model)
  return questionOnlyMatch(projectId, questionText, model)
}

async function directAnswer(projectId: string, questionText: string, model: string): Promise<QaMatchResult> {
  const client = await getOpenAIClient()
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: `あなたは「${project?.name || ''}」についての質問に丁寧な日本語で答えるアシスタントです。` },
      { role: 'user', content: questionText },
    ],
    temperature: 0.7,
  })
  return {
    logic: 1,
    candidates: [],
    directAnswer: completion.choices[0]?.message?.content || '回答を生成できませんでした。',
  }
}

async function questionOnlyMatch(projectId: string, questionText: string, model: string): Promise<QaMatchResult> {
  const qa = await prisma.qaItem.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } })
  if (qa.length === 0) return { logic: 2, candidates: [] }

  const list = qa.map((item, i) => `${i + 1}. ${item.question}`).join('\n')
  const client = await getOpenAIClient()
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'あなたはQAマッチングアシスタントです。ユーザーの質問に最も関連性の高い質問を上位3つ選び、番号のみをJSON配列で返してください。例: [1, 5, 12] 関連するものがない場合は空の配列 [] を返してください。',
      },
      { role: 'user', content: `ユーザーの質問: "${questionText}"\n\n質問リスト:\n${list}` },
    ],
    temperature: 0.3,
  })
  const indices = parseIndices(completion.choices[0]?.message?.content || '[]', qa.length)
  return {
    logic: 2,
    candidates: indices.map((i) => ({ id: qa[i].id, question: qa[i].question, answer: qa[i].answer })),
  }
}

async function fullQaMatch(projectId: string, questionText: string, model: string): Promise<QaMatchResult> {
  const qa = await prisma.qaItem.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } })
  if (qa.length === 0) return { logic: 3, candidates: [] }

  const list = qa.map((item, i) => `${i + 1}. Q: ${item.question}\n   A: ${item.answer}`).join('\n\n')
  const client = await getOpenAIClient()
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'あなたはQAマッチングアシスタントです。ユーザーの質問に最も関連性の高いQAペアを上位3つ選び、番号のみをJSON配列で返してください。例: [1, 5, 12]',
      },
      { role: 'user', content: `ユーザーの質問: "${questionText}"\n\nQ&Aリスト:\n${list}` },
    ],
    temperature: 0.3,
  })
  const indices = parseIndices(completion.choices[0]?.message?.content || '[]', qa.length)
  return {
    logic: 3,
    candidates: indices.map((i) => ({ id: qa[i].id, question: qa[i].question, answer: qa[i].answer })),
  }
}

function parseIndices(text: string, maxLength: number): number[] {
  try {
    const match = text.match(/\[[\d,\s]*\]/)
    if (!match) return []
    const arr = JSON.parse(match[0]) as number[]
    return arr
      .filter((n) => typeof n === 'number' && n >= 1 && n <= maxLength)
      .slice(0, 3)
      .map((n) => n - 1)
  } catch {
    return []
  }
}

const YES_PATTERNS = /^(はい|ええ|そう(です)?|いいよ|うん|お願(い)?|大丈夫|yes|ok|ye)/i
const NO_PATTERNS = /^(いいえ|ちがい|違い|いや|ない|結構|不要|辞退|no|never)/i

export async function classifyYesNo(text: string): Promise<'yes' | 'no' | 'unknown'> {
  const normalized = text.trim()
  if (!normalized) return 'unknown'
  if (YES_PATTERNS.test(normalized)) return 'yes'
  if (NO_PATTERNS.test(normalized)) return 'no'

  try {
    const client = await getOpenAIClient()
    const settings = await getSettings(['gpt_model'])
    const model = settings.gpt_model || 'gpt-4o-mini'
    const completion = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: '次のユーザー発話が肯定（yes）・否定（no）・どちらでもない（unknown）のどれかを判定し、yes または no または unknown の1語のみで答えてください。',
        },
        { role: 'user', content: normalized },
      ],
      temperature: 0,
    })
    const v = (completion.choices[0]?.message?.content || '').trim().toLowerCase()
    if (v.startsWith('yes')) return 'yes'
    if (v.startsWith('no')) return 'no'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
