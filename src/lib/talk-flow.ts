import { z } from 'zod'

export const SayNodeSchema = z.object({
  id: z.string(),
  type: z.literal('say'),
  text: z.string(),
  audioUrl: z.string().optional(),
})

export const AskYesNoNodeSchema = z.object({
  id: z.string(),
  type: z.literal('ask_yesno'),
  text: z.string(),
  audioUrl: z.string().optional(),
  onNo: z.enum(['skip_next', 'end', 'continue']).default('continue'),
})

export const QaLoopNodeSchema = z.object({
  id: z.string(),
  type: z.literal('qa_loop'),
  askPrompt: z.string().default('何かご質問はございませんか？'),
  rePrompt: z.string().default('もう一度お話しください。'),
  confirmTemplate: z.string().default('「{question}」というご質問でよろしいでしょうか？'),
  moreQuestionsPrompt: z.string().default('ほかにご質問はございますか？'),
  noMoreMatchesPrompt: z.string().default('申し訳ありません、もう少し詳しくお願いできますか？'),
  maxCandidates: z.number().int().min(1).max(5).default(3),
})

export const ClosingNodeSchema = z.object({
  id: z.string(),
  type: z.literal('closing'),
  text: z.string(),
  audioUrl: z.string().optional(),
  collectFreeForm: z.boolean().default(true),
})

export const ThanksNodeSchema = z.object({
  id: z.string(),
  type: z.literal('thanks'),
  text: z.string(),
  audioUrl: z.string().optional(),
})

export const TalkNodeSchema = z.discriminatedUnion('type', [
  SayNodeSchema,
  AskYesNoNodeSchema,
  QaLoopNodeSchema,
  ClosingNodeSchema,
  ThanksNodeSchema,
])

export const TalkFlowSchema = z.object({
  version: z.literal(1).default(1),
  nodes: z.array(TalkNodeSchema).min(1),
})

export type SayNode = z.infer<typeof SayNodeSchema>
export type AskYesNoNode = z.infer<typeof AskYesNoNodeSchema>
export type QaLoopNode = z.infer<typeof QaLoopNodeSchema>
export type ClosingNode = z.infer<typeof ClosingNodeSchema>
export type ThanksNode = z.infer<typeof ThanksNodeSchema>
export type TalkNode = z.infer<typeof TalkNodeSchema>
export type TalkFlow = z.infer<typeof TalkFlowSchema>

export function parseTalkFlow(raw: unknown): TalkFlow {
  return TalkFlowSchema.parse(raw)
}

export function safeParseTalkFlow(raw: unknown): TalkFlow | null {
  const r = TalkFlowSchema.safeParse(raw)
  return r.success ? r.data : null
}

export function findNodeIndex(flow: TalkFlow, nodeId: string): number {
  return flow.nodes.findIndex((n) => n.id === nodeId)
}

export function nextNode(flow: TalkFlow, currentId: string): TalkNode | null {
  const i = findNodeIndex(flow, currentId)
  if (i < 0 || i + 1 >= flow.nodes.length) return null
  return flow.nodes[i + 1]
}

export function skipNextNode(flow: TalkFlow, currentId: string): TalkNode | null {
  const i = findNodeIndex(flow, currentId)
  if (i < 0 || i + 2 >= flow.nodes.length) return null
  return flow.nodes[i + 2]
}

export function firstNode(flow: TalkFlow): TalkNode {
  return flow.nodes[0]
}

export function makeDefaultFlow(): TalkFlow {
  return {
    version: 1,
    nodes: [
      { id: 'greeting', type: 'say', text: 'いつもお世話になっております。' },
      { id: 'pitch', type: 'say', text: '本日は弊社サービスのご紹介でお電話いたしました。' },
      { id: 'qa', type: 'qa_loop', askPrompt: '何かご質問はございませんか？', rePrompt: 'もう一度お話しください。', confirmTemplate: '「{question}」というご質問でよろしいでしょうか？', moreQuestionsPrompt: 'ほかにご質問はございますか？', noMoreMatchesPrompt: '申し訳ありません、もう少し詳しくお願いできますか？', maxCandidates: 3 },
      { id: 'closing', type: 'closing', text: '今後ご連絡をさせていただいてもよろしいでしょうか？', collectFreeForm: true },
      { id: 'thanks', type: 'thanks', text: '本日はお時間をいただきまして、誠にありがとうございました。' },
    ],
  }
}

export function makeBtoBAppointmentFlow(): TalkFlow {
  return {
    version: 1,
    nodes: [
      {
        id: 'greeting',
        type: 'say',
        text: 'いつもお世話になっております。お忙しいところ失礼いたします。株式会社サンプルの田中でございます。',
      },
      {
        id: 'pitch',
        type: 'say',
        text: '本日は弊社で提供しているAIコンタクトセンターサービスをご紹介できればと思い、お電話させていただきました。音声AIでお客様対応を自動化し、人件費を最大70パーセント削減できるサービスです。',
      },
      {
        id: 'qa',
        type: 'qa_loop',
        askPrompt: '何かご質問はございませんか？',
        rePrompt: 'もう一度お話しください。',
        confirmTemplate: '「{question}」、というご質問でよろしいでしょうか？',
        moreQuestionsPrompt: 'ほかにご質問はございますか？',
        noMoreMatchesPrompt: '申し訳ありません、もう少し別の言い方でお願いできますか？',
        maxCandidates: 3,
      },
      {
        id: 'closing',
        type: 'closing',
        text: '詳しい情報のご提供をさせていただきたく、今後ご連絡をさせていただいてもよろしいでしょうか？',
        collectFreeForm: true,
      },
      {
        id: 'thanks',
        type: 'thanks',
        text: '本日はお時間をいただきまして、誠にありがとうございました。',
      },
    ],
  }
}

export function makeDefaultWebFlow(askPrompt = 'どのようなご質問でしょうか？'): TalkFlow {
  return {
    version: 1,
    nodes: [
      {
        id: 'qa',
        type: 'qa_loop',
        askPrompt,
        rePrompt: 'もう一度お話しください。',
        confirmTemplate: '「{question}」というご質問でよろしいでしょうか？',
        moreQuestionsPrompt: 'ほかにご質問はありますか？',
        noMoreMatchesPrompt: '申し訳ありません、別の言い方でお願いできますか？',
        maxCandidates: 3,
      },
    ],
  }
}

export function makeSimpleQaFlow(): TalkFlow {
  return {
    version: 1,
    nodes: [
      { id: 'greeting', type: 'say', text: 'こんにちは。ご質問をどうぞ。' },
      {
        id: 'qa',
        type: 'qa_loop',
        askPrompt: 'どのようなご質問でしょうか？',
        rePrompt: 'もう一度お話しください。',
        confirmTemplate: '「{question}」というご質問でよろしいでしょうか？',
        moreQuestionsPrompt: 'ほかにご質問はありますか？',
        noMoreMatchesPrompt: '別の言い方でお願いできますか？',
        maxCandidates: 3,
      },
      { id: 'thanks', type: 'thanks', text: 'ありがとうございました。' },
    ],
  }
}
