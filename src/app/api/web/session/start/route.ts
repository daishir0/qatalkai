import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startSession } from '@/lib/conversation-engine'
import { parseTalkFlow } from '@/lib/talk-flow'
import { customAlphabet } from 'nanoid'

const visitorIdGen = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const shortId = (body?.shortId || '').toString()
  const mode = 'web' as const
  const incomingVisitorId = (body?.visitorId || '').toString() || null

  const project = await prisma.project.findUnique({ where: { shortId } })
  if (!project || !project.isActive) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  const visitorId = incomingVisitorId || visitorIdGen()
  let lead = await prisma.lead.findFirst({
    where: { projectId: project.id, visitorId },
  })
  if (!lead) {
    lead = await prisma.lead.create({
      data: { projectId: project.id, visitorId, callStatus: 'COMPLETED' },
    })
  }

  const session = await startSession({ projectId: project.id, leadId: lead.id, mode })

  // Surface the webFlow's qa_loop prompts so the client can show them as static guidance.
  const flow = parseTalkFlow(project.webFlow)
  const qaNode = flow.nodes.find((n) => n.type === 'qa_loop')
  const askPrompt = qaNode && qaNode.type === 'qa_loop' ? qaNode.askPrompt : null
  const rePrompt = qaNode && qaNode.type === 'qa_loop' ? qaNode.rePrompt : null

  return NextResponse.json({
    sessionId: session.id,
    visitorId,
    projectName: project.name,
    askPrompt,
    rePrompt,
    segments: [],
    finished: false,
  })
}
