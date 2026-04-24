'use client'
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Project {
  id: string
  shortId: string
  name: string
  description?: string | null
  isActive: boolean
  defaultMode: string
  createdAt: string
  _count?: { qaItems: number; leads: number; sessions: number }
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', defaultMode: 'phone' })
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    fetch('/api/admin/projects')
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setProjects(d))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const create = async () => {
    setError(null)
    if (!form.name.trim()) return setError('名前を入力してください')
    const res = await fetch('/api/admin/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) {
      const msg = await res.json().catch(() => ({}))
      return setError(msg.error || '作成に失敗しました')
    }
    setForm({ name: '', description: '', defaultMode: 'phone' })
    setShowForm(false)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await fetch(`/api/admin/projects/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">プロジェクト</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'キャンセル' : '新規作成'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 space-y-3">
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="プロジェクト名（例：BtoBアポ獲得トーク）"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <textarea
            className="w-full border rounded px-3 py-2"
            placeholder="説明（任意）"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex items-center gap-2 text-sm">
            <label>既定モード:</label>
            <select
              value={form.defaultMode}
              onChange={(e) => setForm({ ...form, defaultMode: e.target.value })}
              className="border rounded px-2 py-1"
            >
              <option value="phone">電話発信 (phone)</option>
              <option value="web">Web公開 (web)</option>
              <option value="training">営業トレーニング (training)</option>
            </select>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button onClick={create} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            作成
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">読み込み中...</div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
          プロジェクトがまだありません
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Link href={`/admin/projects/${p.id}`} className="text-lg font-semibold text-blue-700 hover:underline">
                    {p.name}
                  </Link>
                  <span className="text-xs bg-gray-100 rounded px-2 py-0.5">{p.shortId}</span>
                  <span className="text-xs bg-indigo-100 text-indigo-700 rounded px-2 py-0.5">
                    {p.defaultMode}
                  </span>
                  {!p.isActive && (
                    <span className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5">無効</span>
                  )}
                </div>
                {p.description && <div className="text-sm text-gray-500 mt-1">{p.description}</div>}
                <div className="text-xs text-gray-400 mt-1">
                  QA: {p._count?.qaItems ?? 0} / リード: {p._count?.leads ?? 0} / セッション:{' '}
                  {p._count?.sessions ?? 0}
                </div>
              </div>
              <button
                onClick={() => remove(p.id)}
                className="text-sm text-red-600 hover:bg-red-50 px-3 py-1 rounded"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
