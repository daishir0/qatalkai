import { ConversationSession, Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  TalkFlow,
  TalkNode,
  QaLoopNode,
  parseTalkFlow,
  findNodeIndex,
} from './talk-flow'
import { classifyYesNo, matchQuestion, QaCandidate } from './qa-matcher'

export type SegmentVariant =
  | 'greeting'
  | 'pitch'
  | 'open'          // 最初の「ご質問どうぞ」
  | 'reprompt'      // 無音などで再度問う
  | 'confirm_q'     // 「〜の質問でよろしいですか？」
  | 'answer'        // 採択された QA の回答
  | 'ask_more'      // 「ほかに質問は？」
  | 'rephrase'      // 「改めてご質問をお願いします」
  | 'closing'
  | 'thanks'
  | 'generic'

export type Segment =
  | {
      kind: 'say'
      nodeId: string
      text: string
      audioUrl?: string
      variant?: SegmentVariant
      relatedQaQuestion?: string
      matchedQaId?: string
    }
  | {
      kind: 'prompt'
      nodeId: string
      text: string
      audioUrl?: string
      inputType: 'yesno' | 'speech' | 'freeform'
      dtmfMap?: Record<string, string>
      variant?: SegmentVariant
      candidateIndex?: number
      candidateTotal?: number
      relatedQaQuestion?: string
      allCandidates?: { id: string; question: string; answer: string }[]
    }
  | { kind: 'end'; nodeId: string; variant?: SegmentVariant }

export interface StepResult {
  segments: Segment[]
  finished: boolean
}

export interface UserInput {
  transcript?: string
  dtmf?: string
  confidence?: number
}

interface Cursor {
  nodeId: string
  sub?: {
    phase?: string
    candidates?: QaCandidate[]
    candidateIndex?: number
    retries?: number
    currentQ?: string
  }
}

export async function startSession(opts: {
  projectId: string
  leadId?: string
  mode: 'web' | 'phone'
  twilioCallSid?: string
  metadata?: Prisma.InputJsonValue
}): Promise<ConversationSession> {
  const project = await prisma.project.findUnique({ where: { id: opts.projectId } })
  if (!project) throw new Error('Project not found')
  const flow = parseTalkFlow(opts.mode === 'web' ? project.webFlow : project.phoneFlow)
  // Web モードは初手から「ユーザー発話待ち」にして askPrompt TTS をスキップする（UI 側で文言は静的表示）。
  let initCursor: Cursor = { nodeId: flow.nodes[0].id }
  if (opts.mode === 'web') {
    const firstQa = flow.nodes.find((n) => n.type === 'qa_loop')
    if (firstQa) {
      initCursor = { nodeId: firstQa.id, sub: { phase: 'awaiting_question', retries: 0 } }
    }
  }
  return prisma.conversationSession.create({
    data: {
      projectId: opts.projectId,
      leadId: opts.leadId,
      mode: opts.mode,
      twilioCallSid: opts.twilioCallSid,
      cursor: initCursor as unknown as Prisma.InputJsonValue,
      metadata: opts.metadata,
    },
  })
}

export async function stepSession(sessionId: string, userInput?: UserInput): Promise<StepResult> {
  const session = await prisma.conversationSession.findUnique({
    where: { id: sessionId },
    include: { project: true },
  })
  if (!session) throw new Error('Session not found')
  if (session.status !== 'in_progress') {
    return { segments: [{ kind: 'end', nodeId: 'end' }], finished: true }
  }
  const flow = parseTalkFlow(session.mode === 'web' ? session.project.webFlow : session.project.phoneFlow)
  let cursor = (session.cursor as unknown as Cursor) || { nodeId: flow.nodes[0].id }

  const nextTurnNo = await getNextTurnNo(sessionId)
  let turnCounter = nextTurnNo

  if (userInput) {
    await prisma.conversationTurn.create({
      data: {
        sessionId,
        turnNo: turnCounter++,
        nodeId: cursor.nodeId,
        role: 'user',
        kind: userInput.dtmf ? 'dtmf' : 'speech',
        transcript: userInput.transcript ?? null,
        dtmf: userInput.dtmf ?? null,
        confidence: userInput.confidence ?? null,
      },
    })
  }

  const segments: Segment[] = []
  let finished = false
  let safety = 30

  while (safety-- > 0) {
    const node = findNode(flow, cursor.nodeId)
    if (!node) {
      finished = true
      segments.push({ kind: 'end', nodeId: cursor.nodeId })
      break
    }

    const advance = (nextId: string | null) => {
      if (nextId === null) {
        cursor = { nodeId: '__end__' }
      } else {
        cursor = { nodeId: nextId }
      }
    }

    if (node.type === 'say') {
      await recordSystemTurn(sessionId, turnCounter++, node.id, node.text)
      const variant: SegmentVariant = node.id === 'greeting' ? 'greeting' : node.id === 'pitch' ? 'pitch' : 'generic'
      segments.push({ kind: 'say', nodeId: node.id, text: node.text, audioUrl: node.audioUrl, variant })
      advance(nextNodeId(flow, node.id))
      // Consume userInput only once. Continue to find a prompt or end.
      userInput = undefined
      continue
    }

    if (node.type === 'thanks') {
      await recordSystemTurn(sessionId, turnCounter++, node.id, node.text)
      segments.push({ kind: 'say', nodeId: node.id, text: node.text, audioUrl: node.audioUrl, variant: 'thanks' })
      segments.push({ kind: 'end', nodeId: node.id, variant: 'thanks' })
      finished = true
      break
    }

    if (node.type === 'ask_yesno') {
      if (!userInput) {
        await recordSystemTurn(sessionId, turnCounter++, node.id, node.text)
        segments.push({
          kind: 'prompt',
          nodeId: node.id,
          text: node.text,
          audioUrl: node.audioUrl,
          inputType: 'yesno',
          dtmfMap: { '1': 'はい', '2': 'いいえ' },
        })
        break
      }
      const yn = await resolveYesNo(userInput)
      userInput = undefined
      if (yn === 'yes') advance(nextNodeId(flow, node.id))
      else if (yn === 'no') {
        if (node.onNo === 'end') advance(null)
        else if (node.onNo === 'skip_next') advance(skipNextNodeId(flow, node.id))
        else advance(nextNodeId(flow, node.id))
      } else {
        // unknown → re-prompt
        await recordSystemTurn(sessionId, turnCounter++, node.id, `${node.text}（はい、またはいいえでお答えください）`)
        segments.push({
          kind: 'prompt',
          nodeId: node.id,
          text: `${node.text}（はい、またはいいえでお答えください）`,
          audioUrl: node.audioUrl,
          inputType: 'yesno',
          dtmfMap: { '1': 'はい', '2': 'いいえ' },
        })
        break
      }
      continue
    }

    if (node.type === 'qa_loop') {
      const sub = cursor.sub || { phase: 'ask', retries: 0 }

      if (sub.phase === 'ask' || !sub.phase) {
        const prompt = (sub.retries ?? 0) > 0 ? node.rePrompt : node.askPrompt
        await recordSystemTurn(sessionId, turnCounter++, node.id, prompt)
        cursor = { nodeId: node.id, sub: { ...sub, phase: 'awaiting_question' } }
        segments.push({
          kind: 'prompt',
          nodeId: node.id,
          text: prompt,
          inputType: 'speech',
          variant: (sub.retries ?? 0) > 0 ? 'reprompt' : 'open',
        })
        break
      }

      if (sub.phase === 'awaiting_question') {
        const text = (userInput?.transcript || '').trim()
        userInput = undefined
        if (!text) {
          const retries = (sub.retries ?? 0) + 1
          if (retries >= 2) {
            cursor = { nodeId: nextNodeId(flow, node.id) ?? '__end__' }
            continue
          }
          cursor = { nodeId: node.id, sub: { ...sub, phase: 'ask', retries } }
          continue
        }
        const match = await matchQuestion(session.projectId, text)
        const cand = match.candidates.slice(0, node.maxCandidates ?? 3)
        if (cand.length === 0 && match.directAnswer) {
          await recordSystemTurn(sessionId, turnCounter++, node.id, match.directAnswer)
          segments.push({ kind: 'say', nodeId: node.id, text: match.directAnswer, variant: 'answer' })
          cursor = { nodeId: node.id, sub: { phase: 'asking_more', retries: 0 } }
          continue
        }
        if (cand.length === 0) {
          const retries = (sub.retries ?? 0) + 1
          if (retries >= 2) {
            cursor = { nodeId: nextNodeId(flow, node.id) ?? '__end__' }
            continue
          }
          await recordSystemTurn(sessionId, turnCounter++, node.id, node.noMoreMatchesPrompt)
          cursor = { nodeId: node.id, sub: { phase: 'ask', retries } }
          segments.push({
            kind: 'prompt',
            nodeId: node.id,
            text: node.noMoreMatchesPrompt,
            inputType: 'speech',
            variant: 'rephrase',
          })
          break
        }
        cursor = {
          nodeId: node.id,
          sub: { phase: 'confirming', candidates: cand, candidateIndex: 0, currentQ: text, retries: 0 },
        }
        continue
      }

      if (sub.phase === 'confirming') {
        const cands = sub.candidates ?? []
        const idx = sub.candidateIndex ?? 0
        if (idx >= cands.length) {
          // exhausted → re-ask once
          await recordSystemTurn(sessionId, turnCounter++, node.id, node.noMoreMatchesPrompt)
          cursor = { nodeId: node.id, sub: { phase: 'ask', retries: 1 } }
          segments.push({
            kind: 'prompt',
            nodeId: node.id,
            text: node.noMoreMatchesPrompt,
            inputType: 'speech',
            variant: 'rephrase',
          })
          break
        }
        if (!userInput) {
          const confirm = (node as QaLoopNode).confirmTemplate.replace('{question}', cands[idx].question)
          await recordSystemTurn(sessionId, turnCounter++, node.id, confirm)
          segments.push({
            kind: 'prompt',
            nodeId: node.id,
            text: confirm,
            inputType: 'yesno',
            dtmfMap: { '1': 'はい', '2': 'いいえ' },
            variant: 'confirm_q',
            candidateIndex: idx,
            candidateTotal: cands.length,
            relatedQaQuestion: cands[idx].question,
            allCandidates: cands.map((c) => ({ id: c.id, question: c.question, answer: c.answer })),
          })
          break
        }
        const yn = await resolveYesNo(userInput)
        userInput = undefined
        if (yn === 'yes') {
          const ans = cands[idx].answer
          await recordMatchedQa(sessionId, turnCounter++, node.id, ans, cands[idx].id, cands.map((c) => c.id))
          segments.push({
            kind: 'say',
            nodeId: node.id,
            text: ans,
            variant: 'answer',
            relatedQaQuestion: cands[idx].question,
            matchedQaId: cands[idx].id,
          })
          cursor = { nodeId: node.id, sub: { phase: 'asking_more' } }
          continue
        }
        if (yn === 'no') {
          cursor = { nodeId: node.id, sub: { ...sub, candidateIndex: idx + 1 } }
          continue
        }
        // unknown → re-prompt same confirmation
        const confirm = (node as QaLoopNode).confirmTemplate.replace('{question}', cands[idx].question)
        await recordSystemTurn(sessionId, turnCounter++, node.id, `${confirm}（はい、またはいいえでお答えください）`)
        segments.push({
          kind: 'prompt',
          nodeId: node.id,
          text: `${confirm}（はい、またはいいえでお答えください）`,
          inputType: 'yesno',
          dtmfMap: { '1': 'はい', '2': 'いいえ' },
          variant: 'confirm_q',
          candidateIndex: idx,
          candidateTotal: cands.length,
          relatedQaQuestion: cands[idx].question,
          allCandidates: cands.map((c) => ({ id: c.id, question: c.question, answer: c.answer })),
        })
        break
      }

      if (sub.phase === 'asking_more') {
        if (!userInput) {
          await recordSystemTurn(sessionId, turnCounter++, node.id, node.moreQuestionsPrompt)
          segments.push({
            kind: 'prompt',
            nodeId: node.id,
            text: node.moreQuestionsPrompt,
            inputType: 'yesno',
            dtmfMap: { '1': 'はい', '2': 'いいえ' },
            variant: 'ask_more',
          })
          break
        }
        const yn = await resolveYesNo(userInput)
        userInput = undefined
        if (yn === 'yes') {
          cursor = { nodeId: node.id, sub: { phase: 'ask', retries: 0 } }
          continue
        }
        if (yn === 'no') {
          cursor = { nodeId: nextNodeId(flow, node.id) ?? '__end__' }
          continue
        }
        await recordSystemTurn(sessionId, turnCounter++, node.id, `${node.moreQuestionsPrompt}（はい、またはいいえでお答えください）`)
        segments.push({
          kind: 'prompt',
          nodeId: node.id,
          text: `${node.moreQuestionsPrompt}（はい、またはいいえでお答えください）`,
          inputType: 'yesno',
          dtmfMap: { '1': 'はい', '2': 'いいえ' },
          variant: 'ask_more',
        })
        break
      }

      // safety fallthrough
      cursor = { nodeId: nextNodeId(flow, node.id) ?? '__end__' }
      continue
    }

    if (node.type === 'closing') {
      if (!userInput) {
        await recordSystemTurn(sessionId, turnCounter++, node.id, node.text)
        segments.push({
          kind: 'prompt',
          nodeId: node.id,
          text: node.text,
          audioUrl: node.audioUrl,
          inputType: node.collectFreeForm ? 'freeform' : 'yesno',
          dtmfMap: { '1': 'はい', '2': 'いいえ' },
          variant: 'closing',
        })
        break
      }
      // Record their answer then advance
      if (node.collectFreeForm) {
        // already recorded as user turn above — just advance
      } else {
        const yn = await resolveYesNo(userInput)
        await prisma.conversationTurn.create({
          data: {
            sessionId,
            turnNo: turnCounter++,
            nodeId: node.id,
            role: 'system',
            kind: yn === 'yes' ? 'confirm_yes' : yn === 'no' ? 'confirm_no' : 'system_say',
            systemText: `closing answer classified as ${yn}`,
          },
        })
      }
      userInput = undefined
      advance(nextNodeId(flow, node.id))
      continue
    }

    // Fallback: unknown node type → skip
    advance(nextNodeId(flow, (node as TalkNode).id))
  }

  if (cursor.nodeId === '__end__') {
    finished = true
    if (!segments.some((s) => s.kind === 'end')) segments.push({ kind: 'end', nodeId: '__end__' })
  }

  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: {
      cursor: cursor as unknown as Prisma.InputJsonValue,
      status: finished ? 'completed' : 'in_progress',
      completedAt: finished ? new Date() : null,
    },
  })

  return { segments, finished }
}

async function getNextTurnNo(sessionId: string): Promise<number> {
  const last = await prisma.conversationTurn.findFirst({
    where: { sessionId },
    orderBy: { turnNo: 'desc' },
  })
  return (last?.turnNo ?? 0) + 1
}

async function recordSystemTurn(sessionId: string, turnNo: number, nodeId: string, text: string) {
  await prisma.conversationTurn.create({
    data: {
      sessionId,
      turnNo,
      nodeId,
      role: 'system',
      kind: 'system_say',
      systemText: text,
    },
  })
}

async function recordMatchedQa(
  sessionId: string,
  turnNo: number,
  nodeId: string,
  answer: string,
  matchedQaId: string,
  candidateQaIds: string[],
) {
  await prisma.conversationTurn.create({
    data: {
      sessionId,
      turnNo,
      nodeId,
      role: 'system',
      kind: 'system_say',
      systemText: answer,
      matchedQaId,
      candidateQaIds,
    },
  })
}

async function resolveYesNo(input: UserInput): Promise<'yes' | 'no' | 'unknown'> {
  if (input.dtmf === '1') return 'yes'
  if (input.dtmf === '2') return 'no'
  if (input.transcript) return await classifyYesNo(input.transcript)
  return 'unknown'
}

function findNode(flow: TalkFlow, id: string): TalkNode | null {
  return flow.nodes.find((n) => n.id === id) ?? null
}

function nextNodeId(flow: TalkFlow, currentId: string): string | null {
  const i = findNodeIndex(flow, currentId)
  if (i < 0 || i + 1 >= flow.nodes.length) return null
  return flow.nodes[i + 1].id
}

function skipNextNodeId(flow: TalkFlow, currentId: string): string | null {
  const i = findNodeIndex(flow, currentId)
  if (i < 0 || i + 2 >= flow.nodes.length) return null
  return flow.nodes[i + 2].id
}
