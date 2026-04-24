import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { getSetting } from '@/lib/settings'
import QRCode from 'qrcode'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const baseUrl = await getSetting('base_url')
    const url = `${baseUrl || ''}/q/${project.shortId}`
    const qrDataUrl = await QRCode.toDataURL(url)
    return NextResponse.json({ url, qrDataUrl, shortId: project.shortId })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 400 })
  }
}
