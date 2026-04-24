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
  | 'confirmingQ'       // system is reading "～の質問でよろしいですか？"
  | 'waitingYesNo'      // user must answer yes/no
  | 'recordingYesNo'
  | 'processingYesNo'
  | 'speakingAnswer'    // system is reading the answer
  | 'askingMore'
  | 'waitingMore'
  | 'recordingMore'
  | 'processingMore'
  | 'speakingRephrase'
  | 'speakingThanks'
  | 'finished'
  | 'answered'          // text mode: show 3 Q&A cards

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

  // Ensure session exists; returns sessionId.
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
    // If text-only mode and first segment is confirm_q with candidates: show the 3-card list and stop.
    if (!enableVoice) {
      const firstConfirm = segments.find((s) => s.kind === 'prompt' && s.variant === 'confirm_q' && (s.allCandidates?.length ?? 0) > 0) as Segment | undefined
      if (firstConfirm && firstConfirm.allCandidates) {
        setAllCandidates(firstConfirm.allCandidates)
        setPhase('answered')
        return
      }
      // Pure directAnswer (say answer) flow in text mode: show as answered with single card.
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
          // Not expected in web mode
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
          // open / reprompt / generic speech prompt → just go to idle so user can re-record
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
    // Fire off the session start in parallel (no await)
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
    // Keep sessionId so we re-use it; but reset the server-side cursor by starting a new session
    setSessionId(null)
    sessionPromiseRef.current = null
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">404</div>
          <p className="text-gray-600">このプロジェクトは見つかりませんでした。</p>
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
  if (!project.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-gray-600 text-center">このプロジェクトは現在停止中です</div>
      </div>
    )
  }

  const countBadge = candidateIndex !== null && candidateTotal !== null
    ? `Q${candidateIndex + 1} / ${candidateTotal}`
    : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-8">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">{project.name}</h1>
          {project.description && <p className="text-sm text-gray-500">{project.description}</p>}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 text-sm">
            <p className="font-medium mb-1">エラーが発生しました</p>
            <p>{error}</p>
            {error.includes('マイク') && (
              <div className="mt-3 p-3 bg-white rounded-lg text-xs text-gray-600">
                <p className="font-medium text-gray-700 mb-1">マイクの許可方法:</p>
                <p><b>iPhone (Safari):</b> アドレスバー左の「ぁあ」→「Webサイトの設定」→マイクを「許可」</p>
                <p className="mt-1"><b>Android (Chrome):</b> アドレスバー左の鍵アイコン→「権限」→マイクを「許可」</p>
              </div>
            )}
          </div>
        )}

        {phase === 'idle' && (
          <div className="text-center">
            <button
              onClick={startRecording}
              className="w-48 h-48 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg hover:shadow-xl transition-all flex flex-col items-center justify-center mx-auto"
            >
              <svg className="w-16 h-16 mb-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
              <span className="text-lg font-medium">{project.name}<br />について質問する</span>
            </button>
            <p className="text-sm text-gray-500 mt-4">
              {askPrompt || 'ボタンを押して話しかけてください（最大10秒）'}
            </p>
          </div>
        )}

        {phase === 'recording' && (
          <div className="text-center">
            <div className="relative w-48 h-48 mx-auto mb-6">
              <svg className="w-48 h-48 -rotate-90" viewBox="0 0 192 192">
                <circle cx="96" cy="96" r="88" fill="none" stroke="#e5e7eb" strokeWidth="6" />
                <circle
                  cx="96" cy="96" r="88" fill="none" stroke="#ef4444" strokeWidth="6"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={2 * Math.PI * 88 * (1 - recordingTime / 10)}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <button onClick={stopRecording} className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-6 h-6 bg-red-500 rounded-sm animate-pulse mb-2" />
                <span className="text-2xl font-bold text-red-600">{10 - recordingTime}秒</span>
                <span className="text-sm text-gray-500 mt-1">タップで停止</span>
              </button>
            </div>
            <p className="text-red-600 font-medium animate-pulse">録音中...</p>
          </div>
        )}

        {(phase === 'transcribing' || phase === 'asking') && (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">{phase === 'transcribing' ? '音声を文字に変換しています...' : '回答を検索しています...'}</p>
          </div>
        )}

        {phase === 'editing' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">音声変換結果</h3>
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full px-4 py-3 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              rows={3}
            />
            <p className="text-xs text-gray-400 mt-1 mb-4">必要に応じて修正してから送信してください</p>
            <div className="flex gap-3">
              <button onClick={handleSubmitEdited} disabled={!editedText.trim()} className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-medium transition-colors">この内容で質問する</button>
              <button onClick={resetToIdle} className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">やり直す</button>
            </div>
          </div>
        )}

        {phase === 'confirmingQ' && currentPrompt && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
              </svg>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 mb-4">
              {countBadge && <p className="text-sm text-gray-400 mb-2">{countBadge}</p>}
              {relatedQa && <p className="text-lg font-medium text-gray-800">{relatedQa}</p>}
              <p className="text-blue-600 mt-3">に関してでよろしいですか？</p>
            </div>
            <p className="text-sm text-gray-400 animate-pulse">読み上げ中...</p>
          </div>
        )}

        {phase === 'waitingYesNo' && currentPrompt && (
          <div className="text-center py-6">
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              {countBadge && <p className="text-sm text-gray-400 mb-2">{countBadge}</p>}
              {relatedQa ? (
                <>
                  <p className="text-lg font-medium text-gray-800">{relatedQa}</p>
                  <p className="text-blue-600 mt-2">に関してでよろしいですか？</p>
                </>
              ) : (
                <p className="text-lg font-medium text-gray-800">{currentPrompt.text}</p>
              )}
            </div>
            {yesNoError && <div className="bg-yellow-50 text-yellow-700 rounded-lg p-3 mb-4 text-sm">{yesNoError}</div>}
            <div className="flex gap-3 justify-center mb-4">
              <button onClick={() => answerYes('yesno')} className="flex-1 max-w-[140px] py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-lg transition-colors shadow-md">はい</button>
              <button onClick={() => answerNo('yesno')} className="flex-1 max-w-[140px] py-4 bg-red-400 hover:bg-red-500 text-white rounded-xl font-bold text-lg transition-colors shadow-md">いいえ</button>
            </div>
            {project.enableVoiceConversation && (
              <>
                <button onClick={() => startYesNoRecording('recordingYesNo')} className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg mx-auto flex items-center justify-center transition-colors">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                </button>
                <p className="text-xs text-gray-400 mt-2">声で答えることもできます</p>
              </>
            )}
          </div>
        )}

        {(phase === 'recordingYesNo' || phase === 'recordingMore') && (
          <div className="text-center py-8">
            <div className="relative w-32 h-32 mx-auto mb-6">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="#e5e7eb" strokeWidth="6" />
                <circle
                  cx="64" cy="64" r="56" fill="none" stroke="#ef4444" strokeWidth="6"
                  strokeDasharray={2 * Math.PI * 56}
                  strokeDashoffset={2 * Math.PI * 56 * (1 - recordingTime / 5)}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <button onClick={stopRecording} className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-5 h-5 bg-red-500 rounded-sm animate-pulse mb-1" />
                <span className="text-xl font-bold text-red-600">{5 - recordingTime}秒</span>
              </button>
            </div>
            <p className="text-red-600 font-medium animate-pulse">「はい」または「いいえ」とお答えください</p>
          </div>
        )}

        {(phase === 'processingYesNo' || phase === 'processingMore') && (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">聞き取り中...</p>
          </div>
        )}

        {phase === 'speakingAnswer' && currentAnswer && (
          <div className="py-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">回答を読み上げています...</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              {currentAnswer.question && <p className="text-sm text-blue-500 font-medium mb-2">{currentAnswer.question}</p>}
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{currentAnswer.answer}</p>
            </div>
          </div>
        )}

        {phase === 'askingMore' && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
              </svg>
            </div>
            <p className="text-lg text-gray-700 font-medium">{currentPrompt?.text || 'ほかにご質問はありますか？'}</p>
            <p className="text-sm text-gray-400 mt-2 animate-pulse">読み上げ中...</p>
          </div>
        )}

        {phase === 'waitingMore' && currentPrompt && (
          <div className="text-center py-6">
            <p className="text-lg text-gray-700 font-medium mb-6">{currentPrompt.text}</p>
            {yesNoError && <div className="bg-yellow-50 text-yellow-700 rounded-lg p-3 mb-4 text-sm">{yesNoError}</div>}
            <div className="flex gap-3 justify-center mb-4">
              <button onClick={() => answerYes('more')} className="flex-1 max-w-[140px] py-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-lg transition-colors shadow-md">はい</button>
              <button onClick={() => answerNo('more')} className="flex-1 max-w-[140px] py-4 bg-red-400 hover:bg-red-500 text-white rounded-xl font-bold text-lg transition-colors shadow-md">いいえ</button>
            </div>
            {project.enableVoiceConversation && (
              <>
                <button onClick={() => startYesNoRecording('recordingMore')} className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg mx-auto flex items-center justify-center transition-colors">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                </button>
                <p className="text-xs text-gray-400 mt-2">声で答えることもできます</p>
              </>
            )}
          </div>
        )}

        {phase === 'speakingRephrase' && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
              </svg>
            </div>
            <p className="text-lg text-gray-700 font-medium">改めてご質問をお願いします</p>
          </div>
        )}

        {(phase === 'speakingThanks' || phase === 'finished') && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5v14a1 1 0 01-1.707.707L5.586 15z" />
              </svg>
            </div>
            <p className="text-lg text-gray-700 font-medium">ご利用ありがとうございました</p>
            {phase === 'finished' && (
              <button onClick={resetToIdle} className="mt-6 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium">別の質問をする</button>
            )}
          </div>
        )}

        {phase === 'answered' && (
          <div>
            {transcribedText && (
              <div className="bg-blue-50 rounded-xl p-4 mb-4">
                <p className="text-xs text-blue-500 mb-1">あなたの質問</p>
                <p className="text-gray-800">{editedText || transcribedText}</p>
              </div>
            )}
            {allCandidates.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">関連するQ&A（{allCandidates.length}件）</p>
                {allCandidates.map((qa, i) => (
                  <div key={qa.id} className="bg-white rounded-xl shadow-sm p-5">
                    <div className="flex items-start gap-3">
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full mt-0.5">Q{i + 1}</span>
                      <div className="flex-1">
                        {qa.question && <p className="font-medium text-gray-800">{qa.question}</p>}
                        <p className="text-gray-600 text-sm mt-2 whitespace-pre-wrap leading-relaxed">{qa.answer}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {allCandidates.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-500">
                関連するQ&Aが見つかりませんでした。
              </div>
            )}
            <button onClick={resetToIdle} className="w-full mt-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors">別の質問をする</button>
          </div>
        )}

        {['confirmingQ', 'waitingYesNo', 'speakingAnswer', 'askingMore', 'waitingMore'].includes(phase) && (
          <button onClick={resetToIdle} className="w-full mt-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            最初からやり直す
          </button>
        )}
      </div>
    </div>
  )
}
