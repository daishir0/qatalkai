import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId') || undefined
    const mode = url.searchParams.get('mode') || undefined
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200)

    const sessions = await prisma.conversationSession.findMany({
      where: {
        projectId,
        mode,
      },
      include: {
        project: { select: { id: true, name: true, shortId: true } },
        lead: { select: { id: true, displayName: true, phoneNumber: true, visitorId: true } },
        _count: { select: { turns: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    })
    return NextResponse.json(sessions)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
