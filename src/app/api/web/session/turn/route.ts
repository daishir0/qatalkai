import { NextRequest, NextResponse } from 'next/server'
import { stepSession, UserInput } from '@/lib/conversation-engine'
import { transcribeAudio } from '@/lib/stt'

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''
  let sessionId = ''
  let userInput: UserInput | undefined

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    sessionId = String(form.get('sessionId') || '')
    const text = form.get('text')
    const dtmf = form.get('dtmf')
    const audio = form.get('audio')
    if (text) userInput = { transcript: String(text) }
    else if (dtmf) userInput = { dtmf: String(dtmf) }
    else if (audio instanceof File) {
      const result = await transcribeAudio(audio, audio.name || 'audio.webm')
      userInput = { transcript: result.text }
    }
  } else {
    const body = await req.json().catch(() => ({}))
    sessionId = String(body?.sessionId || '')
    if (body?.text) userInput = { transcript: String(body.text) }
    else if (body?.dtmf) userInput = { dtmf: String(body.dtmf) }
  }

  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const result = await stepSession(sessionId, userInput)
  return NextResponse.json({
    sessionId,
    segments: result.segments,
    finished: result.finished,
    transcribed: userInput?.transcript,
  })
}
