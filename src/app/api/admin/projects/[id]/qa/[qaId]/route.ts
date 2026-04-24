import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string; qaId: string }> }) {
  try {
    await requireAuth()
    const { qaId } = await ctx.params
    const body = await req.json()
    const item = await prisma.qaItem.update({
      where: { id: qaId },
      data: {
        question: body?.question,
        answer: body?.answer,
        sortOrder: body?.sortOrder,
      },
    })
    return NextResponse.json(item)
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; qaId: string }> }) {
  try {
    await requireAuth()
    const { qaId } = await ctx.params
    await prisma.qaItem.delete({ where: { id: qaId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
