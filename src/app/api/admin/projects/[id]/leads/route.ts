import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const leads = await prisma.lead.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json(leads)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const body = await req.json()
    const phoneNumber = (body?.phoneNumber || '').toString().trim()
    if (!phoneNumber) return NextResponse.json({ error: 'phoneNumber required' }, { status: 400 })

    const lead = await prisma.lead.create({
      data: {
        projectId: id,
        phoneNumber,
        displayName: body?.displayName || null,
        note: body?.note || null,
      },
    })
    return NextResponse.json(lead, { status: 201 })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
