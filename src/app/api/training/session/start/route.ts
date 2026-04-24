import { NextRequest, NextResponse } from 'next/server'
import { startTrainingSession } from '@/lib/training-engine'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const shortId = (body?.shortId || '').toString().trim()
  const traineeName = (body?.traineeName || '').toString().trim()
  const traineeNumber = (body?.traineeNumber || '').toString().trim()
  const questionCount =
    typeof body?.questionCount === 'number' ? body.questionCount : undefined

  if (!shortId) return NextResponse.json({ error: 'shortId required' }, { status: 400 })
  if (!traineeName) return NextResponse.json({ error: 'traineeName required' }, { status: 400 })

  try {
    const result = await startTrainingSession({
      shortId,
      traineeName,
      traineeNumber,
      questionCount,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'failed' }, { status: 400 })
  }
}
