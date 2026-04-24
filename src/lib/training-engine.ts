import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { DEFAULT_PERSONA, TrainingPersona } from './training-persona'
import {
  EvaluationResult,
  gradeAnswer,
  phraseQuestionAsPersona,
  summarizeSession,
} from './training-grader'

export interface StartTrainingInput {
  shortId: string
  traineeName: string
  traineeNumber: string
  questionCount?: number
}

export interface StartTrainingOutput {
  sessionId: string
  firstQuestion: { text: string; turnNo: number; qaItemId: string }
  totalQuestions: number
  projectName: string
}

export interface TurnInput {
  sessionId: string
  editedText: string
  rawTranscript?: string
}

export interface TurnOutput {
  evaluation: EvaluationResult & { qaItemId: string; question: string }
  next: { text: string; turnNo: number; qaItemId: string } | null
  finished: boolean
  summary?: { totalScore: number; finalFeedback: string }
  progress: { answered: number; total: number }
}

export interface TrainingSessionMetadata {
  trainingMode: true
  traineeName: string
  traineeNumber: string
  personaId: string
  plannedQaIds: string[]
  answeredQaIds: string[]
  perTurnScores: Array<{ qaItemId: string; score: number; improvementPoints: string[] }>
  totalScore?: number
  finalFeedback?: string
}

interface TurnMetadataSystemQuestion {
  kind: 'training_question'
  qaItemId: string
  personaId: string
}

interface TurnMetadataSystemFeedback {
  kind: 'training_feedback'
  qaItemId: string
  evaluation: EvaluationResult
  isFinal?: boolean
}

function clampQuestionCount(n: number | undefined, qaCount: number): number {
  const fallback = 3
  if (typeof n !== 'number' || !Number.isFinite(n)) return Math.min(fallback, qaCount)
  const intN = Math.round(n)
  if (intN < 1) return 1
  if (intN > 10) return 10
  return Math.min(intN, qaCount)
}

function pickRandomQaIds(all: { id: string }[], count: number): string[] {
  const copy = [...all]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count).map((q) => q.id)
}

async function nextTurnNo(sessionId: string): Promise<number> {
  const last = await prisma.conversationTurn.findFirst({
    where: { sessionId },
    orderBy: { turnNo: 'desc' },
    select: { turnNo: true },
  })
  return (last?.turnNo || 0) + 1
}

export async function startTrainingSession(
  input: StartTrainingInput
): Promise<StartTrainingOutput> {
  const project = await prisma.project.findUnique({
    where: { shortId: input.shortId },
    include: { qaItems: true },
  })
  if (!project || !project.isActive) throw new Error('プロジェクトが見つかりません')
  if (project.defaultMode !== 'training') throw new Error('このプロジェクトはトレーニングモードではありません')
  if (project.qaItems.length === 0) throw new Error('このプロジェクトにはQAが登録されていません')

  const persona: TrainingPersona = DEFAULT_PERSONA
  const requested = input.questionCount ?? project.trainingQuestionCount
  const total = clampQuestionCount(requested, project.qaItems.length)
  const plannedQaIds = pickRandomQaIds(project.qaItems, total)

  const lead = await prisma.lead.create({
    data: {
      projectId: project.id,
      displayName: input.traineeName || 'unknown',
      note: input.traineeNumber || null,
      callStatus: 'COMPLETED',
    },
  })

  const metadata: TrainingSessionMetadata = {
    trainingMode: true,
    traineeName: input.traineeName,
    traineeNumber: input.traineeNumber,
    personaId: persona.id,
    plannedQaIds,
    answeredQaIds: [],
    perTurnScores: [],
  }

  const session = await prisma.conversationSession.create({
    data: {
      projectId: project.id,
      leadId: lead.id,
      mode: 'training',
      cursor: { trainingIndex: 0 } as unknown as Prisma.InputJsonValue,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    },
  })

  const firstQa = project.qaItems.find((q) => q.id === plannedQaIds[0])!
  const phrased = await phraseQuestionAsPersona({
    rawQuestion: firstQa.question,
    persona,
    isFirst: true,
  })

  const systemTurn = await prisma.conversationTurn.create({
    data: {
      sessionId: session.id,
      turnNo: 1,
      nodeId: 'training_q',
      role: 'system',
      kind: 'text',
      systemText: phrased,
      metadata: {
        kind: 'training_question',
        qaItemId: firstQa.id,
        personaId: persona.id,
      } satisfies TurnMetadataSystemQuestion as unknown as Prisma.InputJsonValue,
    },
  })

  return {
    sessionId: session.id,
    firstQuestion: { text: phrased, turnNo: systemTurn.turnNo, qaItemId: firstQa.id },
    totalQuestions: total,
    projectName: project.name,
  }
}

export async function stepTrainingTurn(input: TurnInput): Promise<TurnOutput> {
  const session = await prisma.conversationSession.findUnique({
    where: { id: input.sessionId },
    include: { project: { include: { qaItems: true } }, turns: { orderBy: { turnNo: 'asc' } } },
  })
  if (!session) throw new Error('セッションが見つかりません')
  if (session.mode !== 'training') throw new Error('トレーニングセッションではありません')
  if (session.status !== 'in_progress') throw new Error('このセッションは既に終了しています')

  const metadata = session.metadata as unknown as TrainingSessionMetadata | null
  if (!metadata || !metadata.trainingMode) throw new Error('トレーニングメタデータが壊れています')

  const lastSystemTurn = [...session.turns].reverse().find((t) => t.role === 'system')
  const lastMeta = (lastSystemTurn?.metadata as unknown) as TurnMetadataSystemQuestion | TurnMetadataSystemFeedback | null
  if (!lastMeta || lastMeta.kind !== 'training_question') {
    throw new Error('質問ターンが直前にありません')
  }
  const activeQa = session.project.qaItems.find((q) => q.id === lastMeta.qaItemId)
  if (!activeQa) throw new Error('対象のQAが見つかりません')

  const persona: TrainingPersona = DEFAULT_PERSONA
  const evaluation = await gradeAnswer({
    question: activeQa.question,
    referenceAnswer: activeQa.answer,
    userAnswer: input.editedText,
    persona,
  })

  const answeredCount = metadata.answeredQaIds.length + 1
  const totalPlanned = metadata.plannedQaIds.length

  const userTurnNo = await nextTurnNo(session.id)
  await prisma.conversationTurn.create({
    data: {
      sessionId: session.id,
      turnNo: userTurnNo,
      nodeId: 'training_a',
      role: 'user',
      kind: 'text',
      transcript: input.rawTranscript ?? null,
      editedText: input.editedText,
      matchedQaId: activeQa.id,
      metadata: {
        kind: 'training_answer',
        qaItemId: activeQa.id,
      } as unknown as Prisma.InputJsonValue,
    },
  })

  const nextQaId = metadata.plannedQaIds[answeredCount]
  const isLast = !nextQaId

  const feedbackSystemTurnNo = userTurnNo + 1
  const feedbackText = formatFeedback(evaluation)
  await prisma.conversationTurn.create({
    data: {
      sessionId: session.id,
      turnNo: feedbackSystemTurnNo,
      nodeId: 'training_fb',
      role: 'system',
      kind: 'text',
      systemText: feedbackText,
      matchedQaId: activeQa.id,
      metadata: {
        kind: 'training_feedback',
        qaItemId: activeQa.id,
        evaluation,
        isFinal: isLast,
      } satisfies TurnMetadataSystemFeedback as unknown as Prisma.InputJsonValue,
    },
  })

  const updatedScores = [
    ...metadata.perTurnScores,
    {
      qaItemId: activeQa.id,
      score: evaluation.score,
      improvementPoints: evaluation.improvementPoints,
    },
  ]
  const updatedAnswered = [...metadata.answeredQaIds, activeQa.id]

  let nextOutput: TurnOutput['next'] = null
  let summary: TurnOutput['summary']

  if (isLast) {
    const totalScore = Math.round(
      updatedScores.reduce((acc, s) => acc + s.score, 0) / updatedScores.length
    )
    const perTurnForSummary = updatedScores.map((s) => {
      const qa = session.project.qaItems.find((q) => q.id === s.qaItemId)
      return {
        question: qa?.question || '',
        score: s.score,
        improvementPoints: s.improvementPoints,
      }
    })
    const finalFeedback = await summarizeSession({ totalScore, perTurn: perTurnForSummary })
    const updatedMeta: TrainingSessionMetadata = {
      ...metadata,
      answeredQaIds: updatedAnswered,
      perTurnScores: updatedScores,
      totalScore,
      finalFeedback,
    }
    await prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        metadata: updatedMeta as unknown as Prisma.InputJsonValue,
      },
    })
    summary = { totalScore, finalFeedback }
  } else {
    const nextQa = session.project.qaItems.find((q) => q.id === nextQaId)!
    const phrased = await phraseQuestionAsPersona({
      rawQuestion: nextQa.question,
      persona,
      isFirst: false,
    })
    const nextSystemTurnNo = feedbackSystemTurnNo + 1
    const nextSystemTurn = await prisma.conversationTurn.create({
      data: {
        sessionId: session.id,
        turnNo: nextSystemTurnNo,
        nodeId: 'training_q',
        role: 'system',
        kind: 'text',
        systemText: phrased,
        metadata: {
          kind: 'training_question',
          qaItemId: nextQa.id,
          personaId: persona.id,
        } satisfies TurnMetadataSystemQuestion as unknown as Prisma.InputJsonValue,
      },
    })
    nextOutput = { text: phrased, turnNo: nextSystemTurn.turnNo, qaItemId: nextQa.id }

    const updatedMeta: TrainingSessionMetadata = {
      ...metadata,
      answeredQaIds: updatedAnswered,
      perTurnScores: updatedScores,
    }
    await prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        cursor: { trainingIndex: answeredCount } as unknown as Prisma.InputJsonValue,
        metadata: updatedMeta as unknown as Prisma.InputJsonValue,
      },
    })
  }

  return {
    evaluation: { ...evaluation, qaItemId: activeQa.id, question: activeQa.question },
    next: nextOutput,
    finished: isLast,
    summary,
    progress: { answered: answeredCount, total: totalPlanned },
  }
}

function formatFeedback(ev: EvaluationResult): string {
  const lines: string[] = [`スコア: ${ev.score}/100`]
  if (ev.goodPoints.length) lines.push(`良かった点:\n- ${ev.goodPoints.join('\n- ')}`)
  if (ev.improvementPoints.length) lines.push(`改善点:\n- ${ev.improvementPoints.join('\n- ')}`)
  if (ev.modelAnswer) lines.push(`お手本:\n${ev.modelAnswer}`)
  return lines.join('\n\n')
}
