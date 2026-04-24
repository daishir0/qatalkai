import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { SessionData, sessionOptions } from '@/lib/session'
import { cookies } from 'next/headers'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)

  if (!session.isLoggedIn) {
    return NextResponse.json({ isLoggedIn: false }, { status: 401 })
  }

  return NextResponse.json({
    isLoggedIn: true,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
    },
  })
}
