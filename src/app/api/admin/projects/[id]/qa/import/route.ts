import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

    const last = await prisma.qaItem.findFirst({ where: { projectId: id }, orderBy: { sortOrder: 'desc' } })
    let nextOrder = (last?.sortOrder ?? -1) + 1

    const created: string[] = []
    for (const row of rows) {
      const q = String(row['Question'] ?? row['質問'] ?? '').trim()
      const a = String(row['Answer'] ?? row['回答'] ?? '').trim()
      if (!q || !a) continue
      const item = await prisma.qaItem.create({ data: { projectId: id, question: q, answer: a, sortOrder: nextOrder++ } })
      created.push(item.id)
    }

    return NextResponse.json({ ok: true, imported: created.length })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
