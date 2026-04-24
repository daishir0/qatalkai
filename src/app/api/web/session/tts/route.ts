import { NextRequest, NextResponse } from 'next/server'
import { synthesizeSpeech } from '@/lib/tts'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const text = (body?.text || '').toString()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  const result = await synthesizeSpeech(text)
  const audioBytes = new Uint8Array(result.audio)
  return new NextResponse(audioBytes, {
    headers: {
      'Content-Type': result.mimeType,
      'Cache-Control': 'no-store',
    },
  })
}
