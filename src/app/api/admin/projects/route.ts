import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { customAlphabet } from 'nanoid'
import { makeDefaultFlow, makeDefaultWebFlow, parseTalkFlow } from '@/lib/talk-flow'
import { Prisma } from '@prisma/client'

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 6)

const ALLOWED_MODES = ['phone', 'web', 'training'] as const

export async function GET() {
  try {
    await requireAuth()
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { qaItems: true, leads: true, sessions: true } } },
    })
    return NextResponse.json(projects)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const name = (body?.name || '').toString().trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const defaultMode = ALLOWED_MODES.includes(body?.defaultMode) ? body.defaultMode : 'phone'
    const phoneFlow = body?.phoneFlow ? parseTalkFlow(body.phoneFlow) : makeDefaultFlow()
    const webFlow = body?.webFlow ? parseTalkFlow(body.webFlow) : makeDefaultWebFlow()
    const shortId = body?.shortId || nanoid()

    const project = await prisma.project.create({
      data: {
        shortId,
        name,
        description: body?.description || null,
        isActive: body?.isActive ?? true,
        defaultMode,
        phoneFlow: phoneFlow as unknown as Prisma.InputJsonValue,
        webFlow: webFlow as unknown as Prisma.InputJsonValue,
        ttsVoice: body?.ttsVoice || null,
      },
    })
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: (e as Error).message || 'failed' }, { status: 400 })
  }
}
