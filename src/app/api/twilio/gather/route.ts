import { NextRequest, NextResponse } from 'next/server'
import { getSetting } from '@/lib/settings'
import { validateTwilioWebhook } from '@/lib/twilio'
import { stepSession, UserInput } from '@/lib/conversation-engine'
import { buildTwimlFromSegments, ERROR_TWIML } from '@/lib/twiml'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  if (!sessionId) return new NextResponse(ERROR_TWIML, { headers: { 'Content-Type': 'text/xml' } })

  const formData = await req.formData()
  const formParams: Record<string, string> = {}
  formData.forEach((v, k) => { formParams[k] = String(v) })

  const isValid = await validateTwilioWebhook(req, formParams)
  if (!isValid) return new NextResponse(ERROR_TWIML, { status: 403, headers: { 'Content-Type': 'text/xml' } })

  const baseUrl = (await getSetting('base_url')) || `${url.protocol}//${url.host}`
  const voice = (await getSetting('tts_voice')) || 'Polly.Mizuki'
  const dtmfSetting = await getSetting('twilio_dtmf_enabled')
  const dtmfEnabled = dtmfSetting === 'true' || dtmfSetting === '1'

  const userInput: UserInput | undefined = (() => {
    const speech = formParams['SpeechResult']
    const digits = formParams['Digits']
    const conf = formParams['Confidence']
    if (!speech && !digits) return undefined
    return {
      transcript: speech || undefined,
      dtmf: dtmfEnabled ? (digits || undefined) : undefined,
      confidence: conf ? parseFloat(conf) : undefined,
    }
  })()

  try {
    const result = await stepSession(sessionId, userInput)
    const twiml = buildTwimlFromSegments(result.segments, { baseUrl, sessionId, voice, dtmfEnabled })
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } })
  } catch (e) {
    console.error('gather webhook error', e)
    return new NextResponse(ERROR_TWIML, { headers: { 'Content-Type': 'text/xml' } })
  }
}
