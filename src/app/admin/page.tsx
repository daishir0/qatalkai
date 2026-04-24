'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Stats {
  projectCount: number
  leadCount: number
  userCount: number
  sessionCount: number
  todaySessions: number
  completedLeads: number
  completionRate: number
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch('/api/admin/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  const cards = [
    { label: 'プロジェクト', value: stats?.projectCount ?? '-', href: '/admin/projects', color: 'bg-blue-500' },
    { label: 'リード', value: stats?.leadCount ?? '-', href: '/admin/projects', color: 'bg-green-500' },
    { label: 'セッション', value: stats?.sessionCount ?? '-', href: '/admin/sessions', color: 'bg-purple-500' },
    { label: '今日のセッション', value: stats?.todaySessions ?? '-', href: '/admin/sessions', color: 'bg-orange-500' },
    { label: '完了率', value: stats ? `${stats.completionRate}%` : '-', href: '/admin/projects', color: 'bg-teal-500' },
    { label: '管理ユーザー', value: stats?.userCount ?? '-', href: '/admin/users', color: 'bg-gray-500' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ダッシュボード</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center text-white text-lg mb-3`}>
              {card.label[0]}
            </div>
            <div className="text-3xl font-bold text-gray-800">{card.value}</div>
            <div className="text-sm text-gray-500 mt-1">{card.label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
