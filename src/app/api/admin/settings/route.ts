import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
    const settings = await prisma.systemSetting.findMany()
    const map: Record<string, string> = {}
    const sensitiveKeys = ['twilio_account_sid', 'twilio_auth_token', 'openai_api_key']
    for (const s of settings) {
      map[s.key] = sensitiveKeys.includes(s.key) && s.value
        ? s.value.slice(0, 6) + '...' + s.value.slice(-4)
        : s.value
    }
    return NextResponse.json(map)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

const ALLOWED_SETTING_KEYS = [
  'twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number', 'tts_voice', 'base_url',
  'openai_api_key', 'whisper_model', 'gpt_model', 'answer_logic', 'openai_tts_model', 'openai_tts_voice',
  'twilio_live_calls_enabled', 'twilio_dtmf_enabled', 'show_transcription', 'enable_voice_conversation',
]
const SENSITIVE_KEYS = ['twilio_account_sid', 'twilio_auth_token', 'openai_api_key']

export async function PUT(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()

    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_SETTING_KEYS.includes(key)) continue
      if (SENSITIVE_KEYS.includes(key) && String(value).includes('...')) continue
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 })
  }
}
