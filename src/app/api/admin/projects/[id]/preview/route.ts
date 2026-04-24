import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { startSession, stepSession } from '@/lib/conversation-engine'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const leadId = body?.leadId ? String(body.leadId) : undefined

    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

    const session = await startSession({
      projectId: id,
      leadId,
      mode: 'phone',
      metadata: { channel: 'browser-preview', startedBy: 'admin' },
    })
    const first = await stepSession(session.id)

    return NextResponse.json({
      sessionId: session.id,
      projectName: project.name,
      segments: first.segments,
      finished: first.finished,
    })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: (e as Error).message || 'failed' }, { status: 400 })
  }
}
