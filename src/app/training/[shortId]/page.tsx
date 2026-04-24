'use client'

import { useEffect, useRef, useState, useCallback, use } from 'react'

interface ProjectInfo {
  id: string
  name: string
  shortId: string
  description: string | null
  isActive: boolean
  defaultMode: string
  showTranscription: boolean
  enableVoiceConversation: boolean
}

interface QuestionPayload {
  text: string
  turnNo: number
  qaItemId: string
}

interface Evaluation {
  score: number
  goodPoints: string[]
  improvementPoints: string[]
  modelAnswer: string
  qaItemId: string
  question: string
}

type Phase =
  | 'entry'
  | 'intro'
  | 'recording'
  | 'transcribing'
  | 'editing'
  | 'grading'
  | 'feedback'
  | 'summary'
  | 'error'

export default function TrainingPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [phase, setPhase] = useState<Phase>('entry')

  const [traineeName, setTraineeName] = useState('')
  const [traineeNumber, setTraineeNumber] = useState('')
  const [questionCount, setQuestionCount] = useState<number>(3)
  const [error, setError] = useState('')

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<QuestionPayload | null>(null)
  const [currentEvaluation, setCurrentEvaluation] = useState<Evaluation | null>(null)
  const [transcribedText, setTranscribedText] = useState('')
  const [editedText, setEditedText] = useState('')
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [finalSummary, setFinalSummary] = useState<{ totalScore: number; finalFeedback: string } | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${shortId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) {
          setNotFound(true)
          return
        }
        setProject(d)
        if (d.defaultMode !== 'training') setNotFound(true)
      })
  }, [shortId])

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
  }, [])

  const playQuestionTts = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/training/session/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      if (blob.size === 0) return
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.src = url
        try {
          await audioRef.current.play()
        } catch {
          // autoplay may be blocked; user interacted already on start so usually OK
        }
      }
    } catch {
      // fall through silently
    }
  }, [])

  const startSession = async () => {
    setError('')
    if (!traineeName.trim()) {
      setError('氏名を入力してください')
      return
    }
    const res = await fetch('/api/training/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shortId,
        traineeName: traineeName.trim(),
        traineeNumber: traineeNumber.trim(),
        questionCount,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || '開始に失敗しました')
      return
    }
    setSessionId(data.sessionId)
    setCurrentQuestion(data.firstQuestion)
    setTotalQuestions(data.totalQuestions)
    setAnsweredCount(0)
    setPhase('intro')
    playQuestionTts(data.firstQuestion.text)
  }

  const startRecording = async () => {
    setError('')
    setTranscribedText('')
    setEditedText('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        cleanup()
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setPhase('transcribing')
        try {
          const form = new FormData()
          form.append('audio', blob, 'audio.webm')
          const res = await fetch('/api/web/transcribe', { method: 'POST', body: form })
          if (!res.ok) throw new Error('文字起こしに失敗しました')
          const data = await res.json()
          setTranscribedText(data.text || '')
          setEditedText(data.text || '')
          setPhase('editing')
        } catch (e) {
          setError((e as Error).message || '音声変換に失敗しました')
          setPhase('intro')
        }
      }
      recorder.start(250)
      setPhase('recording')
      setRecordingTime(0)
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 29) {
            stopRecording()
            return 30
          }
          return prev + 1
        })
      }, 1000)
    } catch {
      setError('マイクへのアクセスが許可されていません。ブラウザの設定からマイクの使用を許可してください。')
      setPhase('intro')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  const typeAnswerDirectly = () => {
    setTranscribedText('')
    setEditedText('')
    setPhase('editing')
  }

  const submitAnswer = async () => {
    if (!sessionId) return
    if (!editedText.trim()) return
    setPhase('grading')
    setError('')
    try {
      const res = await fetch('/api/training/session/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          editedText: editedText.trim(),
          rawTranscript: transcribedText || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '採点に失敗しました')
        setPhase('editing')
        return
      }
      setCurrentEvaluation(data.evaluation)
      setAnsweredCount(data.progress?.answered ?? answeredCount + 1)
      setPhase('feedback')
      if (data.finished) {
        setFinalSummary(data.summary || null)
      } else if (data.next) {
        setCurrentQuestion(data.next)
      }
    } catch (e) {
      setError((e as Error).message || '通信エラー')
      setPhase('editing')
    }
  }

  const proceedAfterFeedback = () => {
    if (finalSummary) {
      setPhase('summary')
    } else if (currentQuestion) {
      setCurrentEvaluation(null)
      setTranscribedText('')
      setEditedText('')
      setPhase('intro')
      playQuestionTts(currentQuestion.text)
    }
  }

  const restart = () => {
    setPhase('entry')
    setSessionId(null)
    setCurrentQuestion(null)
    setCurrentEvaluation(null)
    setTranscribedText('')
    setEditedText('')
    setFinalSummary(null)
    setAnsweredCount(0)
    setTotalQuestions(0)
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-800 mb-2">プロジェクトが見つかりません</h1>
          <p className="text-sm text-gray-600">
            このURLはトレーニングモードのプロジェクトではないか、無効になっています。
          </p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white p-4 sm:p-6">
      <audio ref={audioRef} hidden />
      <div className="max-w-2xl mx-auto">
        <div className="mb-4 text-center">
          <div className="text-xs text-indigo-600 font-semibold tracking-wider uppercase">営業トレーニング</div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mt-1">{project.name}</h1>
          {totalQuestions > 0 && phase !== 'entry' && phase !== 'summary' && (
            <div className="text-xs text-gray-500 mt-1">
              進捗: {Math.min(answeredCount + (phase === 'feedback' ? 0 : 1), totalQuestions)} / {totalQuestions}
            </div>
          )}
        </div>

        {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {phase === 'entry' && (
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
            <p className="text-sm text-gray-600">
              これから顧客役のAIがいくつか質問をします。顧客として自然な質問に対して、営業として回答してください。回答ごとに評価とお手本が提示されます。
            </p>
            <label className="block">
              <div className="text-xs text-gray-600 mb-1">氏名</div>
              <input
                data-testid="trainee-name"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="例: 山田 太郎"
                value={traineeName}
                onChange={(e) => setTraineeName(e.target.value)}
              />
            </label>
            <label className="block">
              <div className="text-xs text-gray-600 mb-1">社員番号(任意)</div>
              <input
                data-testid="trainee-number"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="例: E-0042"
                value={traineeNumber}
                onChange={(e) => setTraineeNumber(e.target.value)}
              />
            </label>
            <label className="block">
              <div className="text-xs text-gray-600 mb-1">問題数 (1〜10)</div>
              <input
                data-testid="question-count"
                type="number"
                min={1}
                max={10}
                className="w-32 border rounded px-3 py-2 text-sm"
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              />
            </label>
            <button
              data-testid="start-training"
              onClick={startSession}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
            >
              トレーニングを始める
            </button>
          </div>
        )}

        {phase === 'intro' && currentQuestion && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                <span className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700">🧑‍💼</span>
                <span>顧客役AIより</span>
              </div>
              <div data-testid="question-text" className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed">
                {currentQuestion.text}
              </div>
              <button
                onClick={() => playQuestionTts(currentQuestion.text)}
                className="mt-3 text-xs text-indigo-600 hover:underline"
              >
                🔊 もう一度読み上げる
              </button>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <p className="text-xs text-gray-500 text-center">回答を音声で録音するか、直接入力できます</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={startRecording}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  🎤 音声で回答する
                </button>
                <button
                  data-testid="type-answer"
                  onClick={typeAnswerDirectly}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                >
                  ✍️ 直接入力する
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'recording' && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <button onClick={stopRecording} className="w-32 h-32 mx-auto bg-red-50 hover:bg-red-100 rounded-full flex flex-col items-center justify-center">
              <div className="w-6 h-6 bg-red-500 rounded-sm animate-pulse mb-2" />
              <span className="text-2xl font-bold text-red-600">{Math.max(0, 30 - recordingTime)}秒</span>
              <span className="text-xs text-gray-500 mt-1">タップで停止</span>
            </button>
            <p className="text-red-600 font-medium animate-pulse mt-4">録音中...</p>
          </div>
        )}

        {phase === 'transcribing' && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">音声を文字に変換しています...</p>
          </div>
        )}

        {phase === 'editing' && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-medium text-gray-500 mb-2">あなたの回答(編集できます)</h3>
            <textarea
              data-testid="edited-text"
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full px-4 py-3 border rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              rows={6}
              placeholder="回答を入力または編集..."
            />
            <p className="text-xs text-gray-400 mt-1 mb-3">必要に応じて誤字を修正してから提出してください</p>
            <div className="flex gap-3">
              <button
                data-testid="submit-answer"
                onClick={submitAnswer}
                disabled={!editedText.trim()}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 font-medium"
              >
                この回答で提出
              </button>
              <button onClick={() => setPhase('intro')} className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                やり直す
              </button>
            </div>
          </div>
        )}

        {phase === 'grading' && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">AIコーチが評価中です...</p>
          </div>
        )}

        {phase === 'feedback' && currentEvaluation && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-500">評価結果</h3>
                <div data-testid="score" className="text-3xl font-bold text-indigo-600">
                  {currentEvaluation.score}<span className="text-base text-gray-400">/100</span>
                </div>
              </div>
              <details className="text-xs text-gray-500 mb-3" open={false}>
                <summary className="cursor-pointer">対象の質問</summary>
                <div className="mt-1 text-gray-700">{currentEvaluation.question}</div>
              </details>
              {currentEvaluation.goodPoints.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-green-700 mb-1">✅ 良かった点</div>
                  <ul className="text-sm text-gray-700 list-disc list-inside space-y-0.5">
                    {currentEvaluation.goodPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {currentEvaluation.improvementPoints.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-amber-700 mb-1">🔧 改善点</div>
                  <ul className="text-sm text-gray-700 list-disc list-inside space-y-0.5">
                    {currentEvaluation.improvementPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {currentEvaluation.modelAnswer && (
                <div>
                  <div className="text-xs font-semibold text-blue-700 mb-1">📘 お手本</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap bg-blue-50 rounded p-3">
                    {currentEvaluation.modelAnswer}
                  </div>
                </div>
              )}
            </div>
            <button
              data-testid="proceed"
              onClick={proceedAfterFeedback}
              className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
            >
              {finalSummary ? '総評を見る' : '次の質問へ'}
            </button>
          </div>
        )}

        {phase === 'summary' && finalSummary && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl shadow-sm p-6 text-center">
              <div className="text-xs text-gray-500 mb-2">平均スコア</div>
              <div data-testid="total-score" className="text-5xl font-bold text-indigo-600">
                {finalSummary.totalScore}<span className="text-2xl text-gray-400">/100</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">総評</h3>
              <p data-testid="final-feedback" className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {finalSummary.finalFeedback}
              </p>
            </div>
            <button
              onClick={restart}
              className="w-full py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              もう一度挑戦する
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
