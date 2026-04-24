'use client'
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState } from 'react'

interface AdminUser {
  id: string
  email: string
  name: string
  createdAt: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editName, setEditName] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchUsers = async () => {
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword, name: newName }),
    })
    if (res.ok) {
      setNewEmail(''); setNewPassword(''); setNewName('')
      setShowCreate(false)
      fetchUsers()
    } else {
      const data = await res.json()
      setError(data.error)
    }
  }

  const handleUpdate = async (id: string) => {
    const body: Record<string, string> = { email: editEmail, name: editName }
    if (editPassword) body.password = editPassword
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setEditingId(null)
      fetchUsers()
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    if (res.ok) {
      fetchUsers()
    } else {
      const data = await res.json()
      alert(data.error)
    }
  }

  if (loading) return <div className="text-gray-500">読み込み中...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">ユーザー管理</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          + 新規作成
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">新しいユーザー</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名前 *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス *</label>
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード *</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="w-full px-4 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">作成</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm">キャンセル</button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {users.map((user) => (
          <div key={user.id} className="bg-white rounded-xl shadow-sm p-5">
            {editingId === user.id ? (
              <div className="space-y-3">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="名前" className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="メール" className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="新しいパスワード（変更する場合のみ）" className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none" />
                <div className="flex gap-2">
                  <button onClick={() => handleUpdate(user.id)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg">保存</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg">キャンセル</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-800">{user.name}</div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingId(user.id); setEditEmail(user.email); setEditName(user.name); setEditPassword('') }}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => handleDelete(user.id, user.name)}
                    className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                  >
                    削除
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
