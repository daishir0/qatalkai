import Twilio from 'twilio'
import { Segment } from './conversation-engine'

const VoiceResponse = Twilio.twiml.VoiceResponse
/* eslint-disable @typescript-eslint/no-explicit-any */
type SayVoice = any
type TwimlNode = any

export interface TwimlBuildOptions {
  baseUrl: string
  sessionId: string
  voice?: string
  dtmfEnabled?: boolean
  gatherUrlPath?: string
  fallbackUrlPath?: string
}

export function buildTwimlFromSegments(
  segments: Segment[],
  opts: TwimlBuildOptions,
): string {
  const twiml = new VoiceResponse()
  const voice: SayVoice = opts.voice || 'Polly.Mizuki'
  const dtmfEnabled = opts.dtmfEnabled !== false
  const gatherPath = opts.gatherUrlPath || '/api/twilio/gather'
  const gatherAction = `${opts.baseUrl}${gatherPath}?sessionId=${encodeURIComponent(opts.sessionId)}`

  const sayOnly = segments.filter((s) => s.kind === 'say') as Extract<Segment, { kind: 'say' }>[]
  const last = segments[segments.length - 1]

  if (!last) {
    twiml.say({ language: 'ja-JP', voice }, '内部エラーが発生しました。')
    twiml.hangup()
    return twiml.toString()
  }

  if (last.kind === 'end') {
    for (const s of sayOnly) emitSay(twiml, s.text, s.audioUrl, voice)
    twiml.hangup()
    return twiml.toString()
  }

  if (last.kind === 'prompt') {
    for (const s of sayOnly) emitSay(twiml, s.text, s.audioUrl, voice)

    // twilio_dtmf_enabled=false のときは常に音声のみ
    const inputs: ('speech' | 'dtmf')[] = []
    if (!dtmfEnabled) {
      inputs.push('speech')
    } else if (last.inputType === 'yesno') {
      inputs.push('dtmf', 'speech')
    } else if (last.inputType === 'speech') {
      inputs.push('speech')
    } else {
      inputs.push('speech', 'dtmf')
    }

    const gather = twiml.gather({
      input: inputs,
      action: gatherAction,
      method: 'POST',
      timeout: 8,
      speechTimeout: 'auto',
      language: 'ja-JP',
      numDigits: dtmfEnabled && last.inputType === 'yesno' ? 1 : undefined,
    })
    emitSay(gather, last.text, last.audioUrl, voice)
    if (dtmfEnabled && last.inputType === 'yesno' && last.dtmfMap) {
      const options = Object.entries(last.dtmfMap).map(([d, label]) => `${d}は${label}`).join('、')
      gather.pause({ length: 1 })
      gather.say({ language: 'ja-JP', voice }, `数字でお答えの場合は、${options}。`)
    }

    twiml.redirect(gatherAction)
    return twiml.toString()
  }

  for (const s of sayOnly) emitSay(twiml, s.text, s.audioUrl, voice)
  twiml.hangup()
  return twiml.toString()
}

function emitSay(parent: TwimlNode, text: string, audioUrl: string | undefined, voice: SayVoice): void {
  if (audioUrl) parent.play(audioUrl)
  else parent.say({ language: 'ja-JP', voice }, text)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const ERROR_TWIML = '<?xml version="1.0" encoding="UTF-8"?>\n<Response><Say language="ja-JP">エラーが発生しました。失礼いたします。</Say><Hangup/></Response>'
