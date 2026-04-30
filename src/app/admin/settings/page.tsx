'use client'

import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((res) => res.json())
      .then((data) => { setSettings(data); setLoading(false) })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setMsg(res.ok ? '保存しました' : '保存に失敗しました')
    setTimeout(() => setMsg(''), 3000)
  }

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) return <div className="text-gray-500">読み込み中...</div>

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">システム設定</h2>

      <div className="space-y-6">
        {/* Twilio Settings */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Twilio設定</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account SID</label>
              <input
                type="password"
                value={settings.twilio_account_sid || ''}
                onChange={(e) => update('twilio_account_sid', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="AC..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auth Token</label>
              <input
                type="password"
                value={settings.twilio_auth_token || ''}
                onChange={(e) => update('twilio_auth_token', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="認証トークン"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">電話番号（050番号）</label>
              <input
                value={settings.twilio_phone_number || ''}
                onChange={(e) => update('twilio_phone_number', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="+8150XXXXXXXX"
              />
              <p className="text-xs text-gray-400 mt-1">E.164形式（例: +815012345678）で入力してください</p>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={settings.twilio_live_calls_enabled === 'true'}
                  onChange={(e) => update('twilio_live_calls_enabled', e.target.checked ? 'true' : 'false')}
                  className="w-4 h-4"
                />
                実発信を有効化（twilio_live_calls_enabled）
              </label>
              <p className="text-xs text-gray-400 mt-1 ml-6">OFF の間は Twilio へ発信せずにセッションだけ記録します（承認前のガード用）</p>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={settings.twilio_dtmf_enabled === 'true'}
                  onChange={(e) => update('twilio_dtmf_enabled', e.target.checked ? 'true' : 'false')}
                  className="w-4 h-4"
                />
                電話モードで DTMF を使う（twilio_dtmf_enabled）
              </label>
              <p className="text-xs text-gray-400 mt-1 ml-6">OFF のときは電話のプッシュ音を受け付けず、音声認識のみで Yes/No を判定します（「1ははい、2はいいえ」案内も省略）</p>
            </div>
          </div>
        </div>

        {/* OpenAI Settings */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">OpenAI設定</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={settings.openai_api_key || ''}
                onChange={(e) => update('openai_api_key', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="sk-..."
              />
              <p className="text-xs text-gray-400 mt-1">音声認識（Whisper）、回答生成（GPT）、音声合成（TTS）に使用</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GPTモデル</label>
              <select
                value={settings.gpt_model || 'gpt-4o-mini'}
                onChange={(e) => update('gpt_model', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="gpt-4o-mini">gpt-4o-mini（高速・低コスト）</option>
                <option value="gpt-4o">gpt-4o（高精度）</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Whisperモデル</label>
              <select
                value={settings.whisper_model || 'whisper-1'}
                onChange={(e) => update('whisper_model', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="whisper-1">whisper-1</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TTS モデル</label>
              <select
                value={settings.openai_tts_model || 'tts-1'}
                onChange={(e) => update('openai_tts_model', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="tts-1">tts-1（標準）</option>
                <option value="tts-1-hd">tts-1-hd（高品質）</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TTS 音声</label>
              <select
                value={settings.openai_tts_voice || 'alloy'}
                onChange={(e) => update('openai_tts_voice', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="alloy">alloy</option>
                <option value="echo">echo</option>
                <option value="fable">fable</option>
                <option value="onyx">onyx</option>
                <option value="nova">nova</option>
                <option value="shimmer">shimmer</option>
              </select>
            </div>
          </div>
        </div>

        {/* TTS Settings (Twilio) */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">音声設定（Twilio電話用）</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TTS音声</label>
              <select
                value={settings.tts_voice || 'Polly.Mizuki'}
                onChange={(e) => update('tts_voice', e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="Polly.Mizuki">Polly.Mizuki（女性）</option>
                <option value="Polly.Takumi">Polly.Takumi（男性）</option>
                <option value="Google.ja-JP-Neural2-B">Google Neural2-B（男性）</option>
                <option value="Google.ja-JP-Neural2-C">Google Neural2-C（女性）</option>
              </select>
            </div>
          </div>
        </div>

        {/* General Settings */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">一般設定</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ベースURL</label>
            <input
              value={settings.base_url || ''}
              onChange={(e) => update('base_url', e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="https://qatalkai.path-finder.jp"
            />
            <p className="text-xs text-gray-400 mt-1">TwilioのWebhookコールバックURLに使用されます</p>
          </div>
        </div>

        {msg && (
          <div className={`p-3 rounded-lg text-sm ${msg.includes('失敗') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {msg}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
        >
          {saving ? '保存中...' : '設定を保存'}
        </button>
      </div>
    </div>
  )
}
