'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type SegmentKind = 'say' | 'prompt' | 'end'
interface Segment {
  kind: SegmentKind
  nodeId: string
  text?: string
  audioUrl?: string
  inputType?: 'yesno' | 'speech' | 'freeform'
  dtmfMap?: Record<string, string>
}

interface TranscriptLine {
  role: 'system' | 'user'
  text: string
}

export interface CallConsoleProps {
  startUrl: string
  startBody: Record<string, unknown>
  ttsUrl?: string
  turnUrl?: string
  title: string
}

export default function CallConsole({ startUrl, startBody, ttsUrl = '/api/web/session/tts', turnUrl = '/api/web/session/turn', title }: CallConsoleProps) {
  const [started, setStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [pendingPrompt, setPendingPrompt] = useState<Segment | null>(null)
  const [recording, setRecording] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const audioCtxRef = useRef<HTMLAudioElement | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const visitorIdRef = useRef<string | null>(null)

  useEffect(() => {
    const v = localStorage.getItem('qatalkai-visitor-id')
    if (v) visitorIdRef.current = v
  }, [])

  const playTTS = useCallback(async (text: string) => {
    try {
      const res = await fetch(ttsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioCtxRef.current = audio
      await new Promise<void>((resolve) => {
        audio.onended = () => resolve()
        audio.onerror = () => resolve()
        audio.play().catch(() => resolve())
      })
      URL.revokeObjectURL(url)
    } catch {
      // ignore TTS failures silently to not block flow
    }
  }, [ttsUrl])

  const processSegments = useCallback(async (segments: Segment[]) => {
    for (const seg of segments) {
      if (seg.kind === 'say' && seg.text) {
        setTranscript((t) => [...t, { role: 'system', text: seg.text! }])
        await playTTS(seg.text)
      } else if (seg.kind === 'end') {
        setFinished(true)
        setPendingPrompt(null)
        break
      } else if (seg.kind === 'prompt' && seg.text) {
        setTranscript((t) => [...t, { role: 'system', text: seg.text! }])
        await playTTS(seg.text)
        setPendingPrompt(seg)
        break
      }
    }
  }, [playTTS])

  const start = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const body = { ...startBody }
      if (visitorIdRef.current) (body as Record<string, unknown>).visitorId = visitorIdRef.current
      const res = await fetch(startUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`開始に失敗しました (${res.status})`)
      const data = await res.json()
      setSessionId(data.sessionId)
      setStarted(true)
      if (data.visitorId) {
        localStorage.setItem('qatalkai-visitor-id', data.visitorId)
        visitorIdRef.current = data.visitorId
      }
      await processSegments(data.segments)
      if (data.finished) setFinished(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [startUrl, startBody, processSegments])

  const sendUserInput = useCallback(async (payload: FormData | Record<string, unknown>) => {
    if (!sessionId) return
    setLoading(true)
    setPendingPrompt(null)
    try {
      let res: Response
      if (payload instanceof FormData) {
        payload.append('sessionId', sessionId)
        res = await fetch(turnUrl, { method: 'POST', body: payload })
      } else {
        res = await fetch(turnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, ...payload }),
        })
      }
      const data = await res.json()
      if (data.transcribed) setTranscript((t) => [...t, { role: 'user', text: data.transcribed }])
      else if ((payload as Record<string, unknown>).text) {
        setTranscript((t) => [...t, { role: 'user', text: String((payload as Record<string, unknown>).text) }])
      } else if ((payload as Record<string, unknown>).dtmf) {
        setTranscript((t) => [...t, { role: 'user', text: `⌨️ ${String((payload as Record<string, unknown>).dtmf)}` }])
      }
      await processSegments(data.segments || [])
      if (data.finished) setFinished(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [sessionId, turnUrl, processSegments])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mime })
        const form = new FormData()
        form.append('audio', blob, 'audio.webm')
        await sendUserInput(form)
      }
      mediaRef.current = rec
      rec.start()
      setRecording(true)
    } catch (e) {
      setError('マイクにアクセスできませんでした: ' + (e as Error).message)
    }
  }, [sendUserInput])

  const stopRecording = useCallback(() => {
    const rec = mediaRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    setRecording(false)
  }, [])

  const answerYes = () => sendUserInput({ dtmf: '1' })
  const answerNo = () => sendUserInput({ dtmf: '2' })

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold">{title}</h1>
      {!started ? (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center">
          <p className="text-sm text-gray-600 mb-4">開始ボタンを押すと、システムからの発話が始まります。</p>
          <button
            onClick={start}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            開始
          </button>
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-2 max-h-96 overflow-y-auto">
            {transcript.map((t, i) => (
              <div
                key={i}
                className={`rounded-lg p-2 text-sm ${t.role === 'system' ? 'bg-blue-50 text-blue-900' : 'bg-green-50 text-green-900'}`}
              >
                {t.role === 'system' ? '🤖' : '🗣️'} {t.text}
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 text-center">
            {finished ? (
              <div className="text-gray-600">セッションが終了しました。</div>
            ) : loading ? (
              <div className="text-gray-500">...</div>
            ) : pendingPrompt?.inputType === 'yesno' ? (
              <div className="flex gap-3 justify-center">
                <button onClick={answerYes} className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  はい (1)
                </button>
                <button onClick={answerNo} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                  いいえ (2)
                </button>
              </div>
            ) : pendingPrompt ? (
              recording ? (
                <button onClick={stopRecording} className="px-5 py-3 bg-red-600 text-white rounded-full hover:bg-red-700">
                  🔴 録音を終了
                </button>
              ) : (
                <button onClick={startRecording} className="px-5 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700">
                  🎙️ 録音開始
                </button>
              )
            ) : (
              <div className="text-gray-400 text-sm">応答待ち...</div>
            )}
            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          </div>
        </>
      )}
    </div>
  )
}
