'use client'

import { useEffect, useState, use } from 'react'
import CallConsole from '@/components/CallConsole'

export default function PreviewPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const [project, setProject] = useState<{ id: string; name: string } | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${shortId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return setNotFound(true)
        setProject(d)
      })
  }, [shortId])

  if (notFound) return <div className="p-6 text-center text-gray-600">プロジェクトが見つかりません</div>
  if (!project) return <div className="p-6 text-center text-gray-500">読み込み中...</div>

  return (
    <CallConsole
      title={`[体感] ${project.name}`}
      startUrl={`/api/admin/projects/${project.id}/preview`}
      startBody={{ projectId: project.id }}
    />
  )
}
