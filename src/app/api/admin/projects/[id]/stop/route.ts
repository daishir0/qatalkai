import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { stopProject } from '@/lib/call-engine'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    stopProject(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
