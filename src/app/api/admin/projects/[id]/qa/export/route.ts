import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import * as XLSX from 'xlsx'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const items = await prisma.qaItem.findMany({ where: { projectId: id }, orderBy: { sortOrder: 'asc' } })
    const rows = items.map((q, i) => ({ No: i + 1, Question: q.question, Answer: q.answer }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 5 }, { wch: 50 }, { wch: 80 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'QA')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const body = new Uint8Array(buf)

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(project.name)}_QA.xlsx"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
