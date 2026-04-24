import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; leadId: string }> }) {
  try {
    await requireAuth()
    const { leadId } = await ctx.params
    await prisma.lead.delete({ where: { id: leadId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
