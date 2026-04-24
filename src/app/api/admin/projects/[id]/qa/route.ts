import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const items = await prisma.qaItem.findMany({ where: { projectId: id }, orderBy: { sortOrder: 'asc' } })
    return NextResponse.json(items)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const body = await req.json()
    const question = (body?.question || '').toString().trim()
    const answer = (body?.answer || '').toString().trim()
    if (!question || !answer) return NextResponse.json({ error: 'question/answer required' }, { status: 400 })

    const last = await prisma.qaItem.findFirst({ where: { projectId: id }, orderBy: { sortOrder: 'desc' } })
    const sortOrder = (last?.sortOrder ?? -1) + 1

    const item = await prisma.qaItem.create({ data: { projectId: id, question, answer, sortOrder } })
    return NextResponse.json(item, { status: 201 })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
