import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { parseTalkFlow } from '@/lib/talk-flow'
import { Prisma } from '@prisma/client'

const ALLOWED_MODES = ['phone', 'web', 'training']

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const project = await prisma.project.findUnique({
      where: { id },
      include: { qaItems: { orderBy: { sortOrder: 'asc' } }, _count: { select: { leads: true, sessions: true } } },
    })
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(project)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const body = await req.json()

    const data: Prisma.ProjectUpdateInput = {}
    if (body.name !== undefined) data.name = body.name
    if (body.description !== undefined) data.description = body.description
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.defaultMode !== undefined && ALLOWED_MODES.includes(body.defaultMode)) data.defaultMode = body.defaultMode
    if (body.ttsVoice !== undefined) data.ttsVoice = body.ttsVoice
    if (body.trainingQuestionCount !== undefined) {
      const n = Math.round(Number(body.trainingQuestionCount))
      if (Number.isFinite(n) && n >= 1 && n <= 10) data.trainingQuestionCount = n
    }
    if (body.phoneFlow !== undefined) {
      const parsed = parseTalkFlow(body.phoneFlow)
      data.phoneFlow = parsed as unknown as Prisma.InputJsonValue
    }
    if (body.webFlow !== undefined) {
      const parsed = parseTalkFlow(body.webFlow)
      data.webFlow = parsed as unknown as Prisma.InputJsonValue
    }

    // shortId 更新
    if (body.shortId !== undefined) {
      // フォーマット検証: 英数字とハイフンのみ、3-20文字
      const shortIdRegex = /^[a-zA-Z0-9-]{3,20}$/
      if (!shortIdRegex.test(body.shortId)) {
        return NextResponse.json(
          { error: 'shortIdは英数字とハイフンのみ、3〜20文字で指定してください' },
          { status: 400 }
        )
      }

      // ユニーク検証: 他のプロジェクトで使用されていないか
      const existing = await prisma.project.findFirst({
        where: {
          shortId: body.shortId,
          NOT: { id }
        }
      })
      if (existing) {
        return NextResponse.json(
          { error: 'このshortIdは既に使用されています' },
          { status: 400 }
        )
      }

      data.shortId = body.shortId
    }

    const project = await prisma.project.update({ where: { id }, data })
    return NextResponse.json(project)
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: (e as Error).message || 'failed' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    await prisma.project.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
