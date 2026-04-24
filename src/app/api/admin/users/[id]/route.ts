import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const { email, password, name } = await req.json()

    const data: Record<string, string> = {}
    if (email) data.email = email
    if (name) data.name = name
    if (password) data.passwordHash = await bcrypt.hash(password, 10)

    const user = await prisma.adminUser.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, createdAt: true },
    })

    return NextResponse.json(user)
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    const { id } = await params

    if (session.userId === id) {
      return NextResponse.json({ error: '自分自身は削除できません' }, { status: 400 })
    }

    await prisma.adminUser.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if ((e as Error).message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
