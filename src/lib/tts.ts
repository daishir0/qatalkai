import { getOpenAIClient } from './openai'
import { getSettings } from './settings'

export interface TtsResult {
  audio: Buffer
  mimeType: string
}

export async function synthesizeSpeech(text: string): Promise<TtsResult> {
  const settings = await getSettings(['openai_tts_model', 'openai_tts_voice'])
  const model = settings.openai_tts_model || 'tts-1'
  const voice = (settings.openai_tts_voice || 'alloy') as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  const client = await getOpenAIClient()
  const response = await client.audio.speech.create({
    model,
    voice,
    input: text,
    response_format: 'mp3',
  })
  const buf = Buffer.from(await response.arrayBuffer())
  return { audio: buf, mimeType: 'audio/mpeg' }
}
