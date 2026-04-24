import { SessionOptions } from 'iron-session'

export interface SessionData {
  userId?: string
  email?: string
  name?: string
  isLoggedIn: boolean
}

const sessionPassword = process.env.SESSION_SECRET
if (!sessionPassword || sessionPassword.length < 32) {
  throw new Error('SESSION_SECRET environment variable must be set (minimum 32 characters). See .env.example.')
}

export const sessionOptions: SessionOptions = {
  password: sessionPassword,
  cookieName: 'qatalkai-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24, // 24 hours
  },
}
