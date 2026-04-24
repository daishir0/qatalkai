import { getSetting, getSettings } from './settings'
import { TrainingPersona } from './training-persona'

export interface EvaluationResult {
  score: number
  goodPoints: string[]
  improvementPoints: string[]
  modelAnswer: string
}

export interface GradeInput {
  question: string
  referenceAnswer: string
  userAnswer: string
  persona: TrainingPersona
}

const FALLBACK_EVAL: EvaluationResult = {
  score: 80,
  goodPoints: ['(テスト用)要点に触れられていました', '(テスト用)落ち着いて回答できていました'],
  improvementPoints: ['(テスト用)もう少し具体例を添えるとより良くなります'],
  modelAnswer: '(テスト用ダミーのお手本回答)',
}

function buildSystemPrompt(persona: TrainingPersona): string {
  return [
    'あなたは新人営業の回答を評価する日本語のコーチです。',
    '指導的でありつつ、常に励ますトーンで、心理的安全性を大切にしてください。',
    `想定顧客ペルソナ: ${persona.label}(${persona.tone})。このペルソナの立場から見て適切かも考慮してください。`,
    '採点基準: 与えられた referenceAnswer を「正の参照」として、要点の網羅・構成(結論→理由→具体例)・顧客への配慮・禁止表現(誇大/断定)の有無を総合して 0〜100 点で採点してください。',
    '出力は必ず JSON スキーマに従ってください。goodPoints は最大3件、improvementPoints も最大3件、modelAnswer は1〜3文程度。',
  ].join('\n')
}

function buildUserPrompt(input: GradeInput): string {
  return [
    `顧客からの質問:\n${input.question}`,
    '',
    `社内の想定回答(referenceAnswer):\n${input.referenceAnswer}`,
    '',
    `営業新人の実際の回答(userAnswer):\n${input.userAnswer || '(無回答)'}`,
  ].join('\n')
}

export async function gradeAnswer(input: GradeInput): Promise<EvaluationResult> {
  const apiKey = await getSetting('openai_api_key')
  if (!apiKey) return FALLBACK_EVAL

  const settings = await getSettings(['gpt_model'])
  const model = settings.gpt_model || 'gpt-4o-mini'

  try {
    const { getOpenAIClient } = await import('./openai')
    const client = await getOpenAIClient()
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'training_evaluation',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              score: { type: 'integer', minimum: 0, maximum: 100 },
              goodPoints: { type: 'array', items: { type: 'string' }, maxItems: 3 },
              improvementPoints: { type: 'array', items: { type: 'string' }, maxItems: 3 },
              modelAnswer: { type: 'string' },
            },
            required: ['score', 'goodPoints', 'improvementPoints', 'modelAnswer'],
          },
        },
      },
      messages: [
        { role: 'system', content: buildSystemPrompt(input.persona) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    })
    const raw = completion.choices[0]?.message?.content || ''
    const parsed = JSON.parse(raw) as EvaluationResult
    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      goodPoints: (parsed.goodPoints || []).slice(0, 3),
      improvementPoints: (parsed.improvementPoints || []).slice(0, 3),
      modelAnswer: parsed.modelAnswer || '',
    }
  } catch (e) {
    console.error('[training-grader] fallback due to error:', e)
    return FALLBACK_EVAL
  }
}

export interface SummaryInput {
  totalScore: number
  perTurn: Array<{ question: string; score: number; improvementPoints: string[] }>
}

const FALLBACK_SUMMARY = '(テスト用)全体としてバランスのとれた応答ができていました。次回は事例の具体化を意識してみましょう。'

export async function summarizeSession(input: SummaryInput): Promise<string> {
  const apiKey = await getSetting('openai_api_key')
  if (!apiKey) return FALLBACK_SUMMARY

  const settings = await getSettings(['gpt_model'])
  const model = settings.gpt_model || 'gpt-4o-mini'

  try {
    const { getOpenAIClient } = await import('./openai')
    const client = await getOpenAIClient()
    const perTurnText = input.perTurn
      .map((t, i) => `${i + 1}. Q: ${t.question} / score: ${t.score} / 改善: ${t.improvementPoints.join(' / ') || 'なし'}`)
      .join('\n')
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: '営業新人の今回のロールプレイ総評を、日本語で 3〜5 文、励ましつつ具体的な次回への宿題を1つ含めて書いてください。敬体。',
        },
        {
          role: 'user',
          content: `平均スコア: ${input.totalScore}\n各ターンの結果:\n${perTurnText}`,
        },
      ],
    })
    return completion.choices[0]?.message?.content?.trim() || FALLBACK_SUMMARY
  } catch (e) {
    console.error('[training-grader] summary fallback:', e)
    return FALLBACK_SUMMARY
  }
}

export interface PhraseQuestionInput {
  rawQuestion: string
  persona: TrainingPersona
  isFirst: boolean
}

export async function phraseQuestionAsPersona(input: PhraseQuestionInput): Promise<string> {
  const apiKey = await getSetting('openai_api_key')
  if (!apiKey) {
    const prefix = input.isFirst ? `${input.persona.greetingText} ` : ''
    return `${prefix}${input.rawQuestion}`
  }

  const settings = await getSettings(['gpt_model'])
  const model = settings.gpt_model || 'gpt-4o-mini'

  try {
    const { getOpenAIClient } = await import('./openai')
    const client = await getOpenAIClient()
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: input.persona.systemPrompt },
        { role: 'system', content: input.persona.questionStyleHint },
        {
          role: 'user',
          content: `${
            input.isFirst ? `会話の冒頭です。短い挨拶(「${input.persona.greetingText}」を参考)に続けて、次の質問を顧客として自然に投げかけてください。\n` : '続けて次の質問を顧客として自然に投げかけてください。\n'
          }元の質問: ${input.rawQuestion}`,
        },
      ],
    })
    const text = completion.choices[0]?.message?.content?.trim() || input.rawQuestion
    return text
  } catch (e) {
    console.error('[training-grader] phrase fallback:', e)
    const prefix = input.isFirst ? `${input.persona.greetingText} ` : ''
    return `${prefix}${input.rawQuestion}`
  }
}
