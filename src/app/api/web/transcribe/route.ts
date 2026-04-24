import { NextRequest, NextResponse } from 'next/server'
import { transcribeAudio } from '@/lib/stt'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const audio = form.get('audio')
  if (!(audio instanceof File)) return NextResponse.json({ error: 'audio required' }, { status: 400 })
  const result = await transcribeAudio(audio, audio.name || 'audio.webm')
  return NextResponse.json({ text: result.text })
}
