import { getOpenAIClient } from './openai'
import { getSettings } from './settings'

export interface TranscriptionResult {
  text: string
  confidence?: number
}

export async function transcribeAudio(blob: Blob, filename = 'audio.webm'): Promise<TranscriptionResult> {
  const settings = await getSettings(['whisper_model'])
  const model = settings.whisper_model || 'whisper-1'
  const client = await getOpenAIClient()
  const file = new File([blob], filename, { type: blob.type || 'audio/webm' })
  const result = await client.audio.transcriptions.create({
    file,
    model,
    language: 'ja',
  })
  return { text: result.text || '' }
}
