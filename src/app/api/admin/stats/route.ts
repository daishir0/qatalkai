import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [projectCount, leadCount, userCount, sessionCount, todaySessions, completedLeads] = await Promise.all([
      prisma.project.count(),
      prisma.lead.count(),
      prisma.adminUser.count(),
      prisma.conversationSession.count(),
      prisma.conversationSession.count({ where: { startedAt: { gte: today } } }),
      prisma.lead.count({ where: { callStatus: 'COMPLETED' } }),
    ])

    return NextResponse.json({
      projectCount,
      leadCount,
      userCount,
      sessionCount,
      todaySessions,
      completedLeads,
      completionRate: leadCount > 0 ? Math.round((completedLeads / leadCount) * 100) : 0,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
