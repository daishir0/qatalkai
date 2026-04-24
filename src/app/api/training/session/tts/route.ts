import { NextRequest, NextResponse } from 'next/server'
import { synthesizeSpeech } from '@/lib/tts'
import { getSetting } from '@/lib/settings'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const text = (body?.text || '').toString()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const apiKey = await getSetting('openai_api_key')
  if (!apiKey) {
    return new NextResponse(new Uint8Array(0), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  }

  try {
    const result = await synthesizeSpeech(text)
    const audioBytes = new Uint8Array(result.audio)
    return new NextResponse(audioBytes, {
      headers: {
        'Content-Type': result.mimeType,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[training tts] fallback empty audio:', e)
    return new NextResponse(new Uint8Array(0), {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    })
  }
}
