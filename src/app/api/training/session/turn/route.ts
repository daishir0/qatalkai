import { NextRequest, NextResponse } from 'next/server'
import { stepTrainingTurn } from '@/lib/training-engine'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const sessionId = (body?.sessionId || '').toString().trim()
  const editedText = (body?.editedText || body?.text || '').toString()
  const rawTranscript = body?.rawTranscript ? String(body.rawTranscript) : undefined

  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  if (!editedText.trim()) return NextResponse.json({ error: 'editedText required' }, { status: 400 })

  try {
    const result = await stepTrainingTurn({ sessionId, editedText, rawTranscript })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'failed' }, { status: 400 })
  }
}
