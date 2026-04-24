import OpenAI from 'openai'
import { getSetting } from './settings'

export async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getSetting('openai_api_key')
  if (!apiKey) throw new Error('OpenAI APIキーが設定されていません。管理画面の設定から登録してください。')
  return new OpenAI({ apiKey })
}
