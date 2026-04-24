import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { callSingleLead } from '@/lib/call-engine'

interface SessionMetadata {
  channel?: string
  error?: string
  code?: string | null
  status?: number | null
  moreInfo?: string | null
  reason?: string
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string; leadId: string }> }) {
  try {
    await requireAuth()
    const { id, leadId } = await ctx.params
    const lead = await prisma.lead.findFirst({ where: { id: leadId, projectId: id } })
    if (!lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 })
    if (!lead.phoneNumber) return NextResponse.json({ error: 'lead has no phone number' }, { status: 400 })

    await prisma.lead.update({ where: { id: leadId }, data: { callStatus: 'PENDING' } })
    await callSingleLead(id, leadId)
    const updated = await prisma.lead.findUnique({ where: { id: leadId } })

    // Look up the most recent session for this lead to surface any Twilio error detail
    const lastSession = await prisma.conversationSession.findFirst({
      where: { leadId },
      orderBy: { startedAt: 'desc' },
    })
    const meta = (lastSession?.metadata as SessionMetadata | null) || null

    return NextResponse.json({
      ok: updated?.callStatus === 'COMPLETED',
      leadId,
      status: updated?.callStatus,
      sessionId: lastSession?.id,
      channel: meta?.channel,
      error: meta?.error || null,
      twilioCode: meta?.code || null,
      twilioStatus: meta?.status ?? null,
      moreInfo: meta?.moreInfo || null,
    })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: (e as Error).message || 'failed' }, { status: 400 })
  }
}
