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

    let imported = 0
    for (const row of rows) {
      const phone = String(row['電話番号'] ?? row['phone'] ?? row['phoneNumber'] ?? '').trim()
      if (!phone) continue
      const name = String(row['名前'] ?? row['name'] ?? '').trim() || null
      const note = String(row['備考'] ?? row['note'] ?? '').trim() || null
      await prisma.lead.create({
        data: { projectId: id, phoneNumber: phone, displayName: name, note },
      })
      imported++
    }
    return NextResponse.json({ ok: true, imported })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
