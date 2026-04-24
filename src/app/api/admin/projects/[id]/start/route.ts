import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { startProject } from '@/lib/call-engine'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    await startProject(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: (e as Error).message || 'failed' }, { status: 400 })
  }
}
