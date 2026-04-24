'use client'
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface SessionSummary {
  id: string
  mode: string
  status: string
  startedAt: string
  metadata?: { channel?: string } | null
  project?: { id: string; name: string; shortId: string } | null
  lead?: { displayName?: string | null; phoneNumber?: string | null; visitorId?: string | null } | null
  _count?: { turns: number }
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [mode, setMode] = useState('')

  useEffect(() => {
    const qs = mode ? `?mode=${mode}` : ''
    fetch(`/api/admin/sessions${qs}`).then((r) => r.json()).then((d) => Array.isArray(d) && setSessions(d)).catch(() => {})
  }, [mode])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">セッション一覧</h1>
      <div className="mb-4 flex items-center gap-2 text-sm">
        <label>モード:</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)} className="border rounded px-2 py-1">
          <option value="">すべて</option>
          <option value="phone">phone</option>
          <option value="web">web</option>
          <option value="training">training</option>
        </select>
      </div>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">開始</th>
              <th className="px-3 py-2 text-left">プロジェクト</th>
              <th className="px-3 py-2 text-left">モード</th>
              <th className="px-3 py-2 text-left">チャネル</th>
              <th className="px-3 py-2 text-left">相手</th>
              <th className="px-3 py-2 text-left">状態</th>
              <th className="px-3 py-2 text-left">ターン</th>
              <th className="px-3 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2">{new Date(s.startedAt).toLocaleString('ja-JP')}</td>
                <td className="px-3 py-2">{s.project?.name || '-'}</td>
                <td className="px-3 py-2">{s.mode}</td>
                <td className="px-3 py-2">{s.metadata?.channel || (s.mode === 'phone' ? 'twilio' : '-')}</td>
                <td className="px-3 py-2">{s.lead?.phoneNumber || s.lead?.displayName || s.lead?.visitorId || '-'}</td>
                <td className="px-3 py-2">{s.status}</td>
                <td className="px-3 py-2">{s._count?.turns ?? 0}</td>
                <td className="px-3 py-2">
                  <Link className="text-blue-600 hover:underline" href={`/admin/sessions/${s.id}`}>詳細</Link>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">セッションがありません</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
