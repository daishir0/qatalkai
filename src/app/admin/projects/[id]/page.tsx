'use client'
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import type { TalkFlow, TalkNode, QaLoopNode } from '@/lib/talk-flow'

interface Project {
  id: string
  shortId: string
  name: string
  description: string | null
  isActive: boolean
  defaultMode: string
  phoneFlow: TalkFlow
  webFlow: TalkFlow
  ttsVoice: string | null
  trainingQuestionCount: number
}

interface QaItem {
  id: string
  question: string
  answer: string
  sortOrder: number
}

interface Lead {
  id: string
  phoneNumber: string | null
  visitorId: string | null
  displayName: string | null
  note: string | null
  callStatus: string
}

type TabKey = 'flow' | 'qa' | 'leads' | 'run' | 'sessions'

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [tab, setTab] = useState<TabKey>('flow')
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/projects/${id}`)
    if (res.ok) setProject(await res.json())
    setLoading(false)
  }

  useEffect(() => { reload() }, [id])

  if (loading || !project) return <div className="text-gray-500">読み込み中...</div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/admin/projects" className="text-sm text-blue-600 hover:underline">← 一覧</Link>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <span className="text-xs bg-gray-100 rounded px-2 py-0.5">{project.shortId}</span>
        <span className="text-xs bg-indigo-100 text-indigo-700 rounded px-2 py-0.5">主用途: {project.defaultMode}</span>
      </div>

      <div className="flex gap-1 border-b mb-6">
        {(['flow', 'qa', 'leads', 'run', 'sessions'] as TabKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm border-b-2 ${
              tab === k ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            {({ flow: 'トークフロー', qa: 'QA', leads: 'リード', run: '発信', sessions: 'セッション' }[k])}
          </button>
        ))}
      </div>

      {tab === 'flow' && <FlowTab project={project} onSaved={reload} />}
      {tab === 'qa' && <QaTab projectId={project.id} />}
      {tab === 'leads' && <LeadsTab projectId={project.id} />}
      {tab === 'run' && <RunTab project={project} onSaved={reload} />}
      {tab === 'sessions' && <SessionsTab projectId={project.id} />}
    </div>
  )
}

function FlowTab({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [subtab, setSubtab] = useState<'phone' | 'web'>(project.defaultMode === 'web' ? 'web' : 'phone')
  const [phoneFlow, setPhoneFlow] = useState<TalkFlow>(project.phoneFlow)
  const [webFlow, setWebFlow] = useState<TalkFlow>(project.webFlow)
  const [status, setStatus] = useState<string | null>(null)

  const flow = subtab === 'web' ? webFlow : phoneFlow
  const setFlow = subtab === 'web' ? setWebFlow : setPhoneFlow

  const updateNode = (idx: number, patch: Partial<TalkNode>) => {
    const newNodes = flow.nodes.map((n, i) => (i === idx ? ({ ...n, ...patch } as TalkNode) : n))
    setFlow({ ...flow, nodes: newNodes })
  }

  const save = async () => {
    setStatus('保存中...')
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneFlow, webFlow }),
    })
    if (res.ok) { setStatus('保存しました'); onSaved() }
    else setStatus('保存に失敗しました')
  }

  const copyQaFromPhoneToWeb = () => {
    const phoneQa = phoneFlow.nodes.find((n) => n.type === 'qa_loop') as QaLoopNode | undefined
    if (!phoneQa) { setStatus('電話モード用フローに qa_loop がありません'); return }
    const updated = webFlow.nodes.map((n) => n.type === 'qa_loop' ? { ...n, ...{
      askPrompt: phoneQa.askPrompt,
      rePrompt: phoneQa.rePrompt,
      confirmTemplate: phoneQa.confirmTemplate,
      moreQuestionsPrompt: phoneQa.moreQuestionsPrompt,
      noMoreMatchesPrompt: phoneQa.noMoreMatchesPrompt,
      maxCandidates: phoneQa.maxCandidates,
    } } : n)
    setWebFlow({ ...webFlow, nodes: updated })
    setStatus('電話モードの QA 設定を Web モードにコピーしました（保存は別途必要）')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {(['phone', 'web'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSubtab(k)}
            className={`px-4 py-2 text-sm border-b-2 ${
              subtab === k ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            {k === 'phone' ? '電話モード用フロー' : 'Webモード用フロー'}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-600">
        {subtab === 'phone'
          ? 'Twilio 発信と Web 体感で使う、完全なトークフローです。'
          : 'voicebot 同等の Q&A 用。基本は QA ループのみを配置します。'}
      </p>

      {flow.nodes.map((n, i) => (
        <div key={n.id} className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-blue-500">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5">{n.type}</span>
            <span className="text-xs text-gray-500">id: {n.id}</span>
          </div>
          {(n.type === 'say' || n.type === 'ask_yesno' || n.type === 'closing' || n.type === 'thanks') && (
            <textarea
              className="w-full border rounded px-3 py-2 text-sm"
              rows={3}
              value={n.text}
              onChange={(e) => updateNode(i, { text: e.target.value } as Partial<TalkNode>)}
            />
          )}
          {n.type === 'qa_loop' && (
            <div className="space-y-2">
              <label className="text-xs text-gray-600 block">最初の質問促し
                <input className="w-full border rounded px-3 py-2 text-sm mt-1" value={n.askPrompt}
                  onChange={(e) => updateNode(i, { askPrompt: e.target.value } as Partial<TalkNode>)} />
              </label>
              <label className="text-xs text-gray-600 block">再プロンプト
                <input className="w-full border rounded px-3 py-2 text-sm mt-1" value={n.rePrompt}
                  onChange={(e) => updateNode(i, { rePrompt: e.target.value } as Partial<TalkNode>)} />
              </label>
              <label className="text-xs text-gray-600 block">確認テンプレート ({'{question}'} を含める)
                <input className="w-full border rounded px-3 py-2 text-sm mt-1" value={n.confirmTemplate}
                  onChange={(e) => updateNode(i, { confirmTemplate: e.target.value } as Partial<TalkNode>)} />
              </label>
              <label className="text-xs text-gray-600 block">追加質問確認
                <input className="w-full border rounded px-3 py-2 text-sm mt-1" value={n.moreQuestionsPrompt}
                  onChange={(e) => updateNode(i, { moreQuestionsPrompt: e.target.value } as Partial<TalkNode>)} />
              </label>
              <label className="text-xs text-gray-600 block">マッチ失敗時の文言
                <input className="w-full border rounded px-3 py-2 text-sm mt-1" value={n.noMoreMatchesPrompt}
                  onChange={(e) => updateNode(i, { noMoreMatchesPrompt: e.target.value } as Partial<TalkNode>)} />
              </label>
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={save} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>
        {subtab === 'web' && (
          <button onClick={copyQaFromPhoneToWeb} className="px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
            電話モードの QA 設定を Web にコピー
          </button>
        )}
        {status && <span className="text-sm text-gray-600">{status}</span>}
      </div>
    </div>
  )
}

function QaTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<QaItem[]>([])
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const load = () => fetch(`/api/admin/projects/${projectId}/qa`).then((r) => r.json()).then(setItems).catch(() => {})
  useEffect(() => { load() }, [projectId])

  const add = async () => {
    if (!q.trim() || !a.trim()) return
    await fetch(`/api/admin/projects/${projectId}/qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, answer: a }),
    })
    setQ(''); setA(''); load()
  }
  const remove = async (id: string) => {
    await fetch(`/api/admin/projects/${projectId}/qa/${id}`, { method: 'DELETE' })
    load()
  }
  const importExcel = async (file: File) => {
    const form = new FormData(); form.append('file', file)
    await fetch(`/api/admin/projects/${projectId}/qa/import`, { method: 'POST', body: form })
    load()
  }

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <h3 className="font-semibold mb-2">QAを追加</h3>
        <input className="w-full border rounded px-3 py-2 mb-2" placeholder="質問" value={q} onChange={(e) => setQ(e.target.value)} />
        <textarea className="w-full border rounded px-3 py-2 mb-2" placeholder="回答" rows={2} value={a} onChange={(e) => setA(e.target.value)} />
        <div className="flex items-center gap-2">
          <button onClick={add} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">追加</button>
          <a className="text-sm text-blue-600 hover:underline" href={`/api/admin/projects/${projectId}/qa/export`}>Excelエクスポート</a>
          <label className="text-sm text-blue-600 hover:underline cursor-pointer">
            Excelインポート
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files && e.target.files[0] && importExcel(e.target.files[0])} />
          </label>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="bg-white rounded-xl shadow-sm p-3 flex justify-between gap-3">
            <div className="flex-1">
              <div className="text-sm font-semibold">Q. {it.question}</div>
              <div className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">A. {it.answer}</div>
            </div>
            <button onClick={() => remove(it.id)} className="text-sm text-red-600 hover:bg-red-50 px-2 py-1 rounded self-start">削除</button>
          </div>
        ))}
        {items.length === 0 && <div className="text-sm text-gray-500">QAがありません</div>}
      </div>
    </div>
  )
}

function LeadsTab({ projectId }: { projectId: string }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [callResult, setCallResult] = useState<{ id: string; ok: boolean; status: string; error?: string; twilioCode?: string; moreInfo?: string } | null>(null)
  const load = () => fetch(`/api/admin/projects/${projectId}/leads`).then((r) => r.json()).then(setLeads).catch(() => {})
  useEffect(() => { load() }, [projectId])

  const add = async () => {
    if (!phone.trim()) return
    await fetch(`/api/admin/projects/${projectId}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone, displayName: name }),
    })
    setPhone(''); setName(''); load()
  }
  const remove = async (id: string) => {
    await fetch(`/api/admin/projects/${projectId}/leads/${id}`, { method: 'DELETE' })
    load()
  }
  const importExcel = async (file: File) => {
    const form = new FormData(); form.append('file', file)
    await fetch(`/api/admin/projects/${projectId}/leads/import`, { method: 'POST', body: form })
    load()
  }
  const call = async (leadId: string) => {
    setBusyId(leadId)
    setCallResult(null)
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/leads/${leadId}/call`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      setCallResult({
        id: leadId,
        ok: !!data.ok,
        status: data.status || 'unknown',
        error: data.error || undefined,
        twilioCode: data.twilioCode || undefined,
        moreInfo: data.moreInfo || undefined,
      })
      load()
    } finally { setBusyId(null) }
  }

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex items-center gap-2">
        <input className="border rounded px-3 py-2 text-sm" placeholder="電話番号" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="border rounded px-3 py-2 text-sm" placeholder="氏名" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={add} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">追加</button>
        <label className="text-sm text-blue-600 hover:underline cursor-pointer ml-auto">
          Excelインポート
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files && e.target.files[0] && importExcel(e.target.files[0])} />
        </label>
      </div>
      {callResult && !callResult.ok && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 mb-4 text-sm">
          <div className="font-semibold mb-1">発信に失敗しました（{callResult.status}）</div>
          {callResult.error && <div className="whitespace-pre-wrap">{callResult.error}</div>}
          {callResult.twilioCode && <div className="mt-1">Twilioコード: <span className="font-mono">{callResult.twilioCode}</span></div>}
          {callResult.moreInfo && <div className="mt-1"><a href={callResult.moreInfo} target="_blank" className="text-blue-600 hover:underline">{callResult.moreInfo}</a></div>}
        </div>
      )}
      {callResult && callResult.ok && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl p-3 mb-4 text-sm">発信完了（{callResult.status}）</div>
      )}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">電話番号</th>
              <th className="px-3 py-2 text-left">氏名</th>
              <th className="px-3 py-2 text-left">状態</th>
              <th className="px-3 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-3 py-2">{l.phoneNumber || l.visitorId}</td>
                <td className="px-3 py-2">{l.displayName}</td>
                <td className="px-3 py-2">{l.callStatus}</td>
                <td className="px-3 py-2 flex gap-2">
                  {l.phoneNumber && (
                    <button
                      onClick={() => call(l.id)}
                      disabled={busyId === l.id}
                      className="text-green-700 hover:bg-green-50 px-2 py-0.5 rounded disabled:opacity-50"
                    >
                      {busyId === l.id ? '発信中...' : '発信'}
                    </button>
                  )}
                  <button onClick={() => remove(l.id)} className="text-red-600 hover:underline">削除</button>
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-500">リードがありません</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RunTab({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [status, setStatus] = useState<string | null>(null)
  const [qr, setQr] = useState<{ url: string; qrDataUrl: string } | null>(null)
  const [questionCount, setQuestionCount] = useState<number>(project.trainingQuestionCount ?? 3)

  const start = async () => {
    setStatus('発信開始中...')
    const res = await fetch(`/api/admin/projects/${project.id}/start`, { method: 'POST' })
    setStatus(res.ok ? '発信を開始しました' : '発信開始に失敗しました')
  }
  const stop = async () => {
    await fetch(`/api/admin/projects/${project.id}/stop`, { method: 'POST' })
    setStatus('発信を停止しました')
  }
  const loadQr = async () => {
    const res = await fetch(`/api/admin/projects/${project.id}/qr`)
    if (res.ok) setQr(await res.json())
  }
  const saveQuestionCount = async () => {
    setStatus('保存中...')
    const res = await fetch(`/api/admin/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainingQuestionCount: questionCount }),
    })
    if (res.ok) {
      setStatus('保存しました')
      onSaved()
    } else {
      setStatus('保存に失敗しました')
    }
  }
  useEffect(() => { if (project.defaultMode === 'web') loadQr() }, [project.id, project.defaultMode])

  if (project.defaultMode === 'training') {
    const publicUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/training/${project.shortId}`
      : `/training/${project.shortId}`
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold mb-2">営業トレーニングモード</h3>
          <p className="text-sm text-gray-600 mb-3">
            AIが顧客役となり、登録された QA をペルソナ口調に言い換えて受講者に質問します。受講者の回答は LLM が採点し、スコア / 良い点 / 改善点 / お手本回答をフィードバックします。
          </p>
          <div className="flex items-center gap-3 mb-3 text-sm">
            <label>1セッションのデフォルト問題数:</label>
            <input
              type="number"
              min={1}
              max={10}
              value={questionCount}
              onChange={(e) => setQuestionCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-20 border rounded px-2 py-1"
            />
            <button onClick={saveQuestionCount} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">保存</button>
            {status && <span className="text-xs text-gray-500">{status}</span>}
          </div>
          <div className="text-sm">
            <div className="font-medium mb-1">公開URL(受講者はここからアクセス)</div>
            <a href={publicUrl} target="_blank" className="text-blue-600 hover:underline break-all">{publicUrl}</a>
          </div>
          <div className="mt-3">
            <Link href={`/training/${project.shortId}`} target="_blank" className="inline-block px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">
              トレーニング画面を開く
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (project.defaultMode === 'web') {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold mb-2">Web 公開モード</h3>
          <p className="text-sm text-gray-600 mb-3">
            スマートフォンで下記 QR を読み取ると、voicebot と同じ体験の質問ページが開きます。
          </p>
          {qr && (
            <div className="flex items-start gap-4">
              <img src={qr.qrDataUrl} alt="QR" className="w-48 h-48 border rounded" />
              <div className="text-sm">
                <div className="font-medium mb-1">公開 URL</div>
                <a href={qr.url} target="_blank" className="text-blue-600 hover:underline break-all">{qr.url}</a>
                <div className="mt-3 flex gap-2">
                  <Link href={`/q/${project.shortId}`} target="_blank" className="inline-block px-3 py-1 bg-teal-600 text-white rounded text-sm hover:bg-teal-700">
                    公開ページを開く
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-semibold mb-2">電話モード（3 つの運用パターン）</h3>
        <p className="text-sm text-gray-600 mb-3">1. 全リードへの一括発信、2. 個別のリードへ単発発信（リードタブから）、3. ブラウザ上で対話を体感</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={start} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
            全リードへ発信
          </button>
          <button onClick={stop} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
            発信を停止
          </button>
          <Link href={`/preview/${project.shortId}`} target="_blank" className="inline-block px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            Web で体感する
          </Link>
          {status && <span className="text-sm text-gray-600">{status}</span>}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          1 リードずつの発信は「リード」タブの各行の「発信」ボタンから実行できます。
        </p>
      </div>
    </div>
  )
}

interface SessionSummary {
  id: string
  mode: string
  status: string
  startedAt: string
  completedAt?: string | null
  metadata?: { channel?: string } | null
  lead?: { displayName?: string | null; phoneNumber?: string | null; visitorId?: string | null } | null
  _count?: { turns: number }
}

function SessionsTab({ projectId }: { projectId: string }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  useEffect(() => {
    fetch(`/api/admin/sessions?projectId=${projectId}`).then((r) => r.json()).then(setSessions).catch(() => {})
  }, [projectId])
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left">開始</th>
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
              <td colSpan={7} className="px-3 py-6 text-center text-gray-500">セッションがありません</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
