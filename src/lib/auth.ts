import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from './session'

export async function requireAuth(): Promise<SessionData> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) {
    throw new Error('Unauthorized')
  }
  return session
}
