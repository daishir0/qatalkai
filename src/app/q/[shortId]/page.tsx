'use client'

import { useEffect, useState, useRef, useCallback, use } from 'react'

interface ProjectInfo {
  id: string
  name: string
  shortId: string
  description: string | null
  isActive: boolean
  showTranscription: boolean
  enableVoiceConversation: boolean
}

type SegmentVariant =
  | 'greeting' | 'pitch' | 'open' | 'reprompt'
  | 'confirm_q' | 'answer' | 'ask_more' | 'rephrase'
  | 'closing' | 'thanks' | 'generic'

interface SegmentCandidate { id: string; question: string; answer: string }

interface Segment {
  kind: 'say' | 'prompt' | 'end'
  nodeId: string
  text?: string
  audioUrl?: string
  inputType?: 'yesno' | 'speech' | 'freeform'
  dtmfMap?: Record<string, string>
  variant?: SegmentVariant
  candidateIndex?: number
  candidateTotal?: number
  relatedQaQuestion?: string
  allCandidates?: SegmentCandidate[]
}

type Phase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'editing'
  | 'asking'
  | 'confirmingQ'
  | 'waitingYesNo'
  | 'recordingYesNo'
  | 'processingYesNo'
  | 'speakingAnswer'
  | 'askingMore'
  | 'waitingMore'
  | 'recordingMore'
  | 'processingMore'
  | 'speakingRephrase'
  | 'speakingThanks'
  | 'finished'
  | 'answered'

// Wave Animation Component
function WaveAnimation({ phase }: { phase: Phase }) {
  const getWaveClass = () => {
    if (phase === 'recording' || phase === 'recordingYesNo' || phase === 'recordingMore') {
      return 'wave-recording'
    }
    if (phase === 'transcribing' || phase === 'asking' || phase === 'processingYesNo' || phase === 'processingMore') {
      return 'wave-processing'
    }
    if (phase === 'speakingAnswer' || phase === 'speakingThanks' || phase === 'speakingRephrase' || phase === 'confirmingQ' || phase === 'askingMore') {
      return 'wave-speaking'
    }
    return 'wave-idle'
  }

  return (
    <div className={`wave-container ${getWaveClass()}`}>
      <div className="wave-bar" />
      <div className="wave-bar" />
      <div className="wave-bar" />
      <div className="wave-bar" />
      <div className="wave-bar" />
    </div>
  )
}

export default function PublicQuestionPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [askPrompt, setAskPrompt] = useState<string | null>(null)
  const [currentPrompt, setCurrentPrompt] = useState<Segment | null>(null)
  const [currentAnswer, setCurrentAnswer] = useState<{ answer: string; question?: string } | null>(null)
  const [candidateIndex, setCandidateIndex] = useState<number | null>(null)
  const [candidateTotal, setCandidateTotal] = useState<number | null>(null)
  const [relatedQa, setRelatedQa] = useState<string | null>(null)
  const [allCandidates, setAllCandidates] = useState<SegmentCandidate[]>([])
  const [transcribedText, setTranscribedText] = useState('')
  const [editedText, setEditedText] = useState('')
  const [recordingTime, setRecordingTime] = useState(0)
  const [error, setError] = useState('')
  const [yesNoError, setYesNoError] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const visitorIdRef = useRef<string | null>(null)
  const sessionPromiseRef = useRef<Promise<string> | null>(null)

  useEffect(() => {
    const v = typeof window !== 'undefined' ? localStorage.getItem('qatalkai-visitor-id') : null
    if (v) visitorIdRef.current = v
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const load = () => window.speechSynthesis.getVoices()
      load()
      window.speechSynthesis.onvoiceschanged = load
    }
  }, [])

  useEffect(() => {
    fetch(`/api/projects/${shortId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!d) setNotFound(true); else setProject(d) })
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

  const unlockTTS = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const dummy = new SpeechSynthesisUtterance('')
    dummy.volume = 0
    window.speechSynthesis.speak(dummy)
  }, [])

  const speakText = useCallback((text: string, onEnd: () => void) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { onEnd(); return }
    setTimeout(() => {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ja-JP'
      u.rate = 1.0
      const ja = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith('ja'))
      if (ja) u.voice = ja
      window.speechSynthesis.speak(u)
      const keepAlive = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause()
          window.speechSynthesis.resume()
        } else clearInterval(keepAlive)
      }, 10000)
      u.onend = () => { clearInterval(keepAlive); onEnd() }
      u.onerror = () => { clearInterval(keepAlive); onEnd() }
    }, 200)
  }, [])

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
  }, [])

  const ensureSession = useCallback((): Promise<string> => {
    if (sessionId) return Promise.resolve(sessionId)
    if (sessionPromiseRef.current) return sessionPromiseRef.current
    const body: Record<string, unknown> = { shortId, mode: 'web' }
    if (visitorIdRef.current) body.visitorId = visitorIdRef.current
    const p = fetch('/api/web/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('セッション開始に失敗しました')))
      .then((data) => {
        setSessionId(data.sessionId)
        setAskPrompt(data.askPrompt)
        if (data.visitorId) {
          localStorage.setItem('qatalkai-visitor-id', data.visitorId)
          visitorIdRef.current = data.visitorId
        }
        return data.sessionId as string
      })
    sessionPromiseRef.current = p
    return p
  }, [sessionId, shortId])

  const processSegments = useCallback(async (segments: Segment[], enableVoice: boolean) => {
    if (!enableVoice) {
      const firstConfirm = segments.find((s) => s.kind === 'prompt' && s.variant === 'confirm_q' && (s.allCandidates?.length ?? 0) > 0) as Segment | undefined
      if (firstConfirm && firstConfirm.allCandidates) {
        setAllCandidates(firstConfirm.allCandidates)
        setPhase('answered')
        return
      }
      const firstAnswer = segments.find((s) => s.kind === 'say' && s.variant === 'answer') as Segment | undefined
      if (firstAnswer) {
        setAllCandidates([{ id: 'direct', question: '', answer: firstAnswer.text || '' }])
        setPhase('answered')
        return
      }
    }

    for (const seg of segments) {
      if (seg.kind === 'say' && seg.text) {
        const variant = seg.variant || 'generic'
        if (variant === 'answer') {
          setCurrentAnswer({ answer: seg.text, question: seg.relatedQaQuestion })
          setPhase('speakingAnswer')
        } else if (variant === 'thanks') {
          setPhase('speakingThanks')
        } else if (variant === 'greeting' || variant === 'pitch') {
          setPhase('speakingAnswer')
          setCurrentAnswer({ answer: seg.text })
        } else {
          setPhase('speakingAnswer')
          setCurrentAnswer({ answer: seg.text })
        }
        await new Promise<void>((resolve) => speakText(seg.text!, resolve))
      } else if (seg.kind === 'end') {
        setPhase('speakingThanks')
        const thanksText = 'ご利用ありがとうございました'
        await new Promise<void>((resolve) => speakText(thanksText, resolve))
        setPhase('finished')
        return
      } else if (seg.kind === 'prompt' && seg.text) {
        setCurrentPrompt(seg)
        setCandidateIndex(typeof seg.candidateIndex === 'number' ? seg.candidateIndex : null)
        setCandidateTotal(typeof seg.candidateTotal === 'number' ? seg.candidateTotal : null)
        setRelatedQa(seg.relatedQaQuestion || null)

        if (seg.variant === 'confirm_q') {
          setPhase('confirmingQ')
          await new Promise<void>((resolve) => speakText(seg.text!, resolve))
          setPhase('waitingYesNo')
        } else if (seg.variant === 'ask_more') {
          setPhase('askingMore')
          await new Promise<void>((resolve) => speakText(seg.text!, resolve))
          setPhase('waitingMore')
        } else if (seg.variant === 'rephrase') {
          setPhase('speakingRephrase')
          await new Promise<void>((resolve) => speakText('改めてご質問をお願いします', resolve))
          setPhase('idle')
        } else if (seg.variant === 'closing') {
          setPhase('speakingAnswer')
          setCurrentAnswer({ answer: seg.text })
          await new Promise<void>((resolve) => speakText(seg.text!, resolve))
          setPhase('idle')
        } else {
          setPhase('idle')
        }
        return
      }
    }
  }, [speakText])

  const sendTurn = useCallback(async (payload: FormData | Record<string, unknown>, enableVoice: boolean) => {
    const sid = await ensureSession()
    setCurrentPrompt(null)
    try {
      let res: Response
      if (payload instanceof FormData) {
        payload.append('sessionId', sid)
        res = await fetch('/api/web/session/turn', { method: 'POST', body: payload })
      } else {
        res = await fetch('/api/web/session/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid, ...payload }),
        })
      }
      const data = await res.json()
      if (data.transcribed) setTranscribedText(data.transcribed)
      await processSegments(data.segments || [], enableVoice)
    } catch (e) {
      setError((e as Error).message || '通信エラーが発生しました')
      setPhase('idle')
    }
  }, [ensureSession, processSegments])

  const openMicAndRecord = useCallback(async (timeoutSec: number, onBlob: (blob: Blob, mimeType: string) => Promise<void>, targetPhase: Phase): Promise<void> => {
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
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      cleanup()
      const blob = new Blob(chunksRef.current, { type: mimeType })
      await onBlob(blob, mimeType)
    }
    recorder.start(250)
    setPhase(targetPhase)
    setRecordingTime(0)
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        if (prev >= timeoutSec - 1) {
          stopRecording()
          return timeoutSec
        }
        return prev + 1
      })
    }, 1000)
  }, [cleanup])

  const startRecording = useCallback(async () => {
    if (!project) return
    setError('')
    setTranscribedText('')
    setEditedText('')
    setCurrentAnswer(null)
    setAllCandidates([])
    unlockTTS()
    ensureSession().catch((e) => setError((e as Error).message))

    try {
      await openMicAndRecord(10, async (blob) => {
        setPhase('transcribing')
        try {
          if (project.showTranscription) {
            const form = new FormData()
            form.append('audio', blob, 'audio.webm')
            const res = await fetch('/api/web/transcribe', { method: 'POST', body: form })
            if (!res.ok) throw new Error('文字起こしに失敗しました')
            const data = await res.json()
            setTranscribedText(data.text || '')
            setEditedText(data.text || '')
            setPhase('editing')
          } else {
            setPhase('asking')
            const form = new FormData()
            form.append('audio', blob, 'audio.webm')
            await sendTurn(form, project.enableVoiceConversation)
          }
        } catch (e) {
          setError((e as Error).message || '音声変換に失敗しました')
          setPhase('idle')
        }
      }, 'recording')
    } catch {
      setPhase('idle')
      setError('マイクへのアクセスが許可されていません。ブラウザの設定からマイクの使用を許可してください。')
    }
  }, [project, openMicAndRecord, ensureSession, sendTurn, unlockTTS])

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  const handleSubmitEdited = useCallback(() => {
    if (!project) return
    unlockTTS()
    setPhase('asking')
    sendTurn({ text: editedText }, project.enableVoiceConversation)
  }, [project, editedText, sendTurn, unlockTTS])

  const answerYes = (context: 'yesno' | 'more') => {
    if (!project) return
    setYesNoError('')
    unlockTTS()
    setPhase(context === 'yesno' ? 'speakingAnswer' : 'asking')
    sendTurn({ dtmf: '1' }, project.enableVoiceConversation)
  }
  const answerNo = (context: 'yesno' | 'more') => {
    if (!project) return
    setYesNoError('')
    unlockTTS()
    setPhase(context === 'yesno' ? 'confirmingQ' : 'speakingThanks')
    sendTurn({ dtmf: '2' }, project.enableVoiceConversation)
  }

  const startYesNoRecording = async (targetPhase: 'recordingYesNo' | 'recordingMore') => {
    if (!project) return
    setYesNoError('')
    unlockTTS()
    try {
      await openMicAndRecord(5, async (blob) => {
        setPhase(targetPhase === 'recordingYesNo' ? 'processingYesNo' : 'processingMore')
        const form = new FormData()
        form.append('audio', blob, 'audio.webm')
        await sendTurn(form, project.enableVoiceConversation)
      }, targetPhase)
    } catch {
      setYesNoError('マイクにアクセスできません。ボタンでお答えください。')
    }
  }

  const resetToIdle = () => {
    stopSpeaking()
    cleanup()
    setPhase('idle')
    setCurrentPrompt(null)
    setCurrentAnswer(null)
    setCandidateIndex(null)
    setCandidateTotal(null)
    setRelatedQa(null)
    setAllCandidates([])
    setTranscribedText('')
    setEditedText('')
    setError('')
    setYesNoError('')
    setSessionId(null)
    sessionPromiseRef.current = null
  }

  // Loading and error states
  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
        <div className="text-center">
          <div className="text-6xl mb-4 text-slate-300">404</div>
          <p className="text-slate-500">このプロジェクトは見つかりませんでした</p>
        </div>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
        <div className="wave-container wave-processing">
          <div className="wave-bar" />
          <div className="wave-bar" />
          <div className="wave-bar" />
          <div className="wave-bar" />
          <div className="wave-bar" />
        </div>
      </div>
    )
  }
  if (!project.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white px-4">
        <div className="text-slate-500 text-center">このプロジェクトは現在停止中です</div>
      </div>
    )
  }

  const countBadge = candidateIndex !== null && candidateTotal !== null
    ? `Q${candidateIndex + 1} / ${candidateTotal}`
    : null

  // Get status text based on phase
  const getStatusText = () => {
    switch (phase) {
      case 'idle': return askPrompt || 'ボタンをタップして質問してください'
      case 'recording': return `録音中... ${10 - recordingTime}秒`
      case 'transcribing': return '音声を認識しています...'
      case 'asking': return '回答を検索しています...'
      case 'confirmingQ': return '確認中...'
      case 'waitingYesNo': return 'お答えください'
      case 'speakingAnswer': return '回答を読み上げています'
      case 'speakingThanks': return 'ありがとうございました'
      case 'finished': return '終了しました'
      default: return ''
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col">
      {/* Header */}
      <header className="px-4 py-4 text-center border-b border-slate-100">
        <h1 className="text-lg font-semibold text-slate-700">{project.name}</h1>
        {project.description && (
          <p className="text-xs text-slate-400 mt-1">{project.description}</p>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        {/* Error Display */}
        {error && (
          <div className="w-full max-w-md mb-6 p-4 glass-card rounded-2xl border-red-200 bg-red-50/80">
            <p className="text-red-600 text-sm font-medium mb-1">エラーが発生しました</p>
            <p className="text-red-500 text-sm">{error}</p>
            {error.includes('マイク') && (
              <div className="mt-3 p-3 bg-white/80 rounded-xl text-xs text-slate-600">
                <p className="font-medium text-slate-700 mb-1">マイクの許可方法:</p>
                <p><b>iPhone:</b> アドレスバー左の「ぁあ」→「Webサイトの設定」→マイクを「許可」</p>
                <p className="mt-1"><b>Android:</b> アドレスバー左の鍵アイコン→「権限」→マイクを「許可」</p>
              </div>
            )}
          </div>
        )}

        {/* Wave Animation */}
        <div className="mb-6">
          <WaveAnimation phase={phase} />
        </div>

        {/* Status Text */}
        <p className="text-sm text-slate-500 mb-6 text-center">{getStatusText()}</p>

        {/* User's Question Display */}
        {(transcribedText || editedText) && phase !== 'editing' && phase !== 'idle' && (
          <div className="w-full max-w-md mb-4 px-4 py-3 bg-blue-50 rounded-xl text-right">
            <p className="text-sm text-slate-700">{editedText || transcribedText}</p>
          </div>
        )}

        {/* AI Response Card */}
        {currentAnswer && ['speakingAnswer', 'speakingThanks', 'finished'].includes(phase) && (
          <div className="w-full max-w-md mb-6 glass-card rounded-2xl p-5">
            {currentAnswer.question && (
              <p className="text-sm text-blue-500 font-medium mb-2">{currentAnswer.question}</p>
            )}
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{currentAnswer.answer}</p>
          </div>
        )}

        {/* Editing Mode */}
        {phase === 'editing' && (
          <div className="w-full max-w-md glass-card rounded-2xl p-5">
            <h3 className="text-sm font-medium text-slate-500 mb-2">音声認識結果</h3>
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none resize-none bg-white/50"
              rows={3}
            />
            <p className="text-xs text-slate-400 mt-2 mb-4">必要に応じて修正してから送信してください</p>
            <div className="flex gap-3">
              <button
                onClick={handleSubmitEdited}
                disabled={!editedText.trim()}
                className="flex-1 py-3 btn-primary text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                この内容で質問する
              </button>
              <button
                onClick={resetToIdle}
                className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
              >
                やり直す
              </button>
            </div>
          </div>
        )}

        {/* Yes/No Confirmation for Question */}
        {(phase === 'confirmingQ' || phase === 'waitingYesNo') && currentPrompt && (
          <div className="w-full max-w-md">
            <div className="glass-card rounded-2xl p-5 mb-4">
              {countBadge && (
                <span className="inline-block bg-blue-100 text-blue-600 text-xs font-medium px-2 py-1 rounded-full mb-2">
                  {countBadge}
                </span>
              )}
              {relatedQa ? (
                <>
                  <p className="text-lg font-medium text-slate-800">{relatedQa}</p>
                  <p className="text-blue-500 mt-2">についてでよろしいですか？</p>
                </>
              ) : (
                <p className="text-lg font-medium text-slate-800">{currentPrompt.text}</p>
              )}
            </div>
            {phase === 'waitingYesNo' && (
              <>
                {yesNoError && (
                  <div className="bg-amber-50 text-amber-700 rounded-xl p-3 mb-4 text-sm">{yesNoError}</div>
                )}
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={() => answerYes('yesno')}
                    className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    はい
                  </button>
                  <button
                    onClick={() => answerNo('yesno')}
                    className="flex-1 py-4 bg-rose-400 hover:bg-rose-500 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    いいえ
                  </button>
                </div>
                {project.enableVoiceConversation && (
                  <div className="text-center">
                    <button
                      onClick={() => startYesNoRecording('recordingYesNo')}
                      className="w-14 h-14 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 shadow-md mx-auto flex items-center justify-center transition-colors"
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                      </svg>
                    </button>
                    <p className="text-xs text-slate-400 mt-2">声で答えることもできます</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Recording Yes/No */}
        {(phase === 'recordingYesNo' || phase === 'recordingMore') && (
          <div className="text-center">
            <div className="relative w-28 h-28 mx-auto mb-4">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
                <circle cx="56" cy="56" r="50" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                <circle
                  cx="56" cy="56" r="50" fill="none" stroke="#ef4444" strokeWidth="6"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={2 * Math.PI * 50 * (1 - recordingTime / 5)}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <button
                onClick={stopRecording}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                <div className="w-5 h-5 bg-red-500 rounded-sm btn-recording mb-1" />
                <span className="text-lg font-bold text-red-600">{5 - recordingTime}秒</span>
              </button>
            </div>
            <p className="text-red-500 text-sm font-medium">「はい」または「いいえ」</p>
          </div>
        )}

        {/* Processing Yes/No */}
        {(phase === 'processingYesNo' || phase === 'processingMore') && (
          <div className="text-center">
            <p className="text-slate-500 text-sm">聞き取り中...</p>
          </div>
        )}

        {/* Ask More */}
        {(phase === 'askingMore' || phase === 'waitingMore') && currentPrompt && (
          <div className="w-full max-w-md">
            <div className="glass-card rounded-2xl p-5 mb-4 text-center">
              <p className="text-lg text-slate-700 font-medium">{currentPrompt.text || 'ほかにご質問はありますか？'}</p>
            </div>
            {phase === 'waitingMore' && (
              <>
                {yesNoError && (
                  <div className="bg-amber-50 text-amber-700 rounded-xl p-3 mb-4 text-sm">{yesNoError}</div>
                )}
                <div className="flex gap-3 mb-4">
                  <button
                    onClick={() => answerYes('more')}
                    className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    はい
                  </button>
                  <button
                    onClick={() => answerNo('more')}
                    className="flex-1 py-4 bg-rose-400 hover:bg-rose-500 text-white rounded-2xl font-bold text-lg transition-all shadow-lg shadow-rose-200 flex items-center justify-center gap-2"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    いいえ
                  </button>
                </div>
                {project.enableVoiceConversation && (
                  <div className="text-center">
                    <button
                      onClick={() => startYesNoRecording('recordingMore')}
                      className="w-14 h-14 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 shadow-md mx-auto flex items-center justify-center transition-colors"
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                      </svg>
                    </button>
                    <p className="text-xs text-slate-400 mt-2">声で答えることもできます</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Rephrase */}
        {phase === 'speakingRephrase' && (
          <div className="glass-card rounded-2xl p-5 max-w-md text-center">
            <p className="text-slate-700 font-medium">改めてご質問をお願いします</p>
          </div>
        )}

        {/* Thanks / Finished */}
        {(phase === 'speakingThanks' || phase === 'finished') && !currentAnswer && (
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg text-slate-700 font-medium">ご利用ありがとうございました</p>
            {phase === 'finished' && (
              <button
                onClick={resetToIdle}
                className="mt-6 px-6 py-3 btn-primary text-white rounded-xl font-medium"
              >
                別の質問をする
              </button>
            )}
          </div>
        )}

        {/* Text Mode - Answered with Cards */}
        {phase === 'answered' && (
          <div className="w-full max-w-md">
            {transcribedText && (
              <div className="mb-4 px-4 py-3 bg-blue-50 rounded-xl text-right">
                <p className="text-xs text-blue-400 mb-1">あなたの質問</p>
                <p className="text-sm text-slate-700">{editedText || transcribedText}</p>
              </div>
            )}
            {allCandidates.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">関連するQ&A（{allCandidates.length}件）</p>
                {allCandidates.map((qa, i) => (
                  <div key={qa.id} className="glass-card rounded-2xl p-5">
                    <div className="flex items-start gap-3">
                      <span className="bg-blue-100 text-blue-600 text-xs font-bold px-2 py-1 rounded-full shrink-0">
                        Q{i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        {qa.question && (
                          <p className="font-medium text-slate-800 mb-2">{qa.question}</p>
                        )}
                        <p className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">{qa.answer}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {allCandidates.length === 0 && (
              <div className="glass-card rounded-2xl p-6 text-center text-slate-500">
                関連するQ&Aが見つかりませんでした
              </div>
            )}
            <button
              onClick={resetToIdle}
              className="w-full mt-6 py-3 btn-primary text-white rounded-xl font-medium"
            >
              別の質問をする
            </button>
          </div>
        )}
      </main>

      {/* Footer - Main Recording Button */}
      {phase === 'idle' && (
        <footer className="p-4 pb-8">
          <button
            onClick={startRecording}
            className="w-full max-w-md mx-auto flex items-center justify-center gap-3 py-4 px-6 btn-primary text-white rounded-2xl font-medium text-lg shadow-xl shadow-blue-200"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
            質問する
          </button>
        </footer>
      )}

      {/* Recording State - Stop Button */}
      {phase === 'recording' && (
        <footer className="p-4 pb-8">
          <button
            onClick={stopRecording}
            className="w-full max-w-md mx-auto flex items-center justify-center gap-3 py-4 px-6 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-medium text-lg shadow-xl shadow-red-200 btn-recording"
          >
            <div className="w-5 h-5 bg-white rounded-sm" />
            録音を停止（残り {10 - recordingTime}秒）
          </button>
        </footer>
      )}

      {/* Reset Button for intermediate states */}
      {['confirmingQ', 'waitingYesNo', 'speakingAnswer', 'askingMore', 'waitingMore'].includes(phase) && (
        <footer className="p-4 text-center">
          <button
            onClick={resetToIdle}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            最初からやり直す
          </button>
        </footer>
      )}
    </div>
  )
}
