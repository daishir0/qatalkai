import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { SessionData, sessionOptions } from '@/lib/session'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'メールアドレスとパスワードを入力してください' }, { status: 400 })
    }

    const user = await prisma.adminUser.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 })
    }

    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      return NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 })
    }

    const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
    session.userId = user.id
    session.email = user.email
    session.name = user.name
    session.isLoggedIn = true
    await session.save()

    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } })
  } catch {
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 500 })
  }
}
