'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'

interface TrainingEvaluation {
  score: number
  goodPoints: string[]
  improvementPoints: string[]
  modelAnswer: string
}

interface TurnMetadataQuestion {
  kind: 'training_question'
  qaItemId: string
  personaId: string
}
interface TurnMetadataFeedback {
  kind: 'training_feedback'
  qaItemId: string
  evaluation: TrainingEvaluation
  isFinal?: boolean
}
interface TurnMetadataAnswer {
  kind: 'training_answer'
  qaItemId: string
}

type TurnMetadata = TurnMetadataQuestion | TurnMetadataFeedback | TurnMetadataAnswer | null

interface Turn {
  id: string
  turnNo: number
  nodeId: string
  role: string
  kind: string
  transcript: string | null
  editedText: string | null
  dtmf: string | null
  confidence: number | null
  candidateQaIds: string[]
  matchedQaId: string | null
  systemText: string | null
  audioUrl: string | null
  metadata?: TurnMetadata
  createdAt: string
}

interface TrainingSessionMetadata {
  trainingMode?: true
  traineeName?: string
  traineeNumber?: string
  personaId?: string
  plannedQaIds?: string[]
  answeredQaIds?: string[]
  perTurnScores?: Array<{ qaItemId: string; score: number; improvementPoints: string[] }>
  totalScore?: number
  finalFeedback?: string
}

interface Session {
  id: string
  mode: string
  status: string
  startedAt: string
  completedAt: string | null
  metadata?: TrainingSessionMetadata | null
  project: { id: string; name: string }
  lead: { displayName: string | null; phoneNumber: string | null; visitorId: string | null; note: string | null } | null
  turns: Turn[]
  matchedQaMap: Record<string, { question: string; answer: string }>
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    fetch(`/api/admin/sessions/${id}`).then((r) => r.json()).then(setSession).catch(() => {})
  }, [id])

  if (!session) return <div className="text-gray-500">読み込み中...</div>

  const isTraining = session.mode === 'training'
  const meta = session.metadata || null

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/admin/sessions" className="text-sm text-blue-600 hover:underline">← 一覧</Link>
        <h1 className="text-2xl font-bold">セッション詳細</h1>
      </div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 text-sm">
        <div>プロジェクト: {session.project?.name}</div>
        <div>モード: {session.mode}</div>
        <div>状態: {session.status}</div>
        {isTraining ? (
          <>
            <div>受講者: {meta?.traineeName || session.lead?.displayName || '-'} {meta?.traineeNumber ? `(${meta.traineeNumber})` : session.lead?.note ? `(${session.lead.note})` : ''}</div>
          </>
        ) : (
          <div>相手: {session.lead?.phoneNumber || session.lead?.displayName || session.lead?.visitorId || '-'}</div>
        )}
        <div>開始: {new Date(session.startedAt).toLocaleString('ja-JP')}</div>
        {session.completedAt && <div>終了: {new Date(session.completedAt).toLocaleString('ja-JP')}</div>}
      </div>

      {isTraining && typeof meta?.totalScore === 'number' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-indigo-900">総合結果</div>
            <div data-testid="admin-total-score" className="text-3xl font-bold text-indigo-700">
              {meta.totalScore}<span className="text-base text-indigo-400">/100</span>
            </div>
          </div>
          {meta.finalFeedback && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{meta.finalFeedback}</p>
          )}
        </div>
      )}

      {isTraining ? <TrainingTurns turns={session.turns} qaMap={session.matchedQaMap} /> : <GenericTurns session={session} />}
    </div>
  )
}

function TrainingTurns({ turns, qaMap }: { turns: Turn[]; qaMap: Record<string, { question: string; answer: string }> }) {
  return (
    <div className="space-y-3">
      {turns.map((t) => {
        const m = t.metadata || null
        if (t.role === 'system' && m?.kind === 'training_question') {
          return (
            <div key={t.id} className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-indigo-400">
              <div className="text-xs text-gray-500 mb-1">#{t.turnNo} AI顧客</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{t.systemText}</div>
              {m.qaItemId && qaMap[m.qaItemId] && (
                <div className="text-xs text-gray-400 mt-2">↳ 元QA: {qaMap[m.qaItemId].question}</div>
              )}
            </div>
          )
        }
        if (t.role === 'user' && m?.kind === 'training_answer') {
          return (
            <div key={t.id} className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-green-400">
              <div className="text-xs text-gray-500 mb-1">#{t.turnNo} 受講者の回答</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{t.editedText || t.transcript || '(無回答)'}</div>
              {t.transcript && t.editedText && t.transcript !== t.editedText && (
                <details className="text-xs text-gray-400 mt-2">
                  <summary className="cursor-pointer">音声文字起こし(編集前)</summary>
                  <div className="mt-1">{t.transcript}</div>
                </details>
              )}
            </div>
          )
        }
        if (t.role === 'system' && m?.kind === 'training_feedback') {
          const ev = m.evaluation
          return (
            <div key={t.id} className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-400">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-500">#{t.turnNo} 評価</div>
                <div className="text-2xl font-bold text-indigo-600">{ev.score}<span className="text-sm text-gray-400">/100</span></div>
              </div>
              {ev.goodPoints?.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-green-700 mb-1">✅ 良かった点</div>
                  <ul className="text-sm text-gray-700 list-disc list-inside">
                    {ev.goodPoints.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {ev.improvementPoints?.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-amber-700 mb-1">🔧 改善点</div>
                  <ul className="text-sm text-gray-700 list-disc list-inside">
                    {ev.improvementPoints.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {ev.modelAnswer && (
                <div>
                  <div className="text-xs font-semibold text-blue-700 mb-1">📘 お手本</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap bg-blue-50 rounded p-2">{ev.modelAnswer}</div>
                </div>
              )}
            </div>
          )
        }
        return null
      })}
      {turns.length === 0 && <div className="text-sm text-gray-500">ターンがありません</div>}
    </div>
  )
}

function GenericTurns({ session }: { session: Session }) {
  return (
    <div className="space-y-2">
      {session.turns.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl shadow-sm p-3 ${t.role === 'system' ? 'bg-blue-50' : 'bg-green-50'}`}
        >
          <div className="text-xs text-gray-500 mb-1">
            #{t.turnNo} / {t.role} / {t.kind} / node: {t.nodeId}
          </div>
          {t.role === 'system' && t.systemText && (
            <div className="text-sm whitespace-pre-wrap">🤖 {t.systemText}</div>
          )}
          {t.role === 'user' && t.transcript && (
            <div className="text-sm">🗣️ {t.transcript}{t.confidence ? ` (${(t.confidence * 100).toFixed(0)}%)` : ''}</div>
          )}
          {t.dtmf && <div className="text-sm">⌨️ DTMF: {t.dtmf}</div>}
          {t.matchedQaId && session.matchedQaMap[t.matchedQaId] && (
            <div className="text-xs text-gray-500 mt-1">
              ↳ matched QA: {session.matchedQaMap[t.matchedQaId].question}
            </div>
          )}
        </div>
      ))}
      {session.turns.length === 0 && <div className="text-sm text-gray-500">ターンがありません</div>}
    </div>
  )
}
