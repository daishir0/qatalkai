import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const session = await prisma.conversationSession.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true, shortId: true } },
        lead: true,
        turns: { orderBy: { turnNo: 'asc' } },
      },
    })
    if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const matchedIds = session.turns.flatMap((t) => (t.matchedQaId ? [t.matchedQaId] : []))
    const qaMap: Record<string, { question: string; answer: string }> = {}
    if (matchedIds.length > 0) {
      const qa = await prisma.qaItem.findMany({ where: { id: { in: matchedIds } } })
      for (const q of qa) qaMap[q.id] = { question: q.question, answer: q.answer }
    }

    return NextResponse.json({ ...session, matchedQaMap: qaMap })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
