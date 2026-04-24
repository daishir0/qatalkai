import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateTwilioWebhook } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  const leadId = url.searchParams.get('leadId')

  const formData = await req.formData()
  const formParams: Record<string, string> = {}
  formData.forEach((v, k) => { formParams[k] = String(v) })

  const isValid = await validateTwilioWebhook(req, formParams)
  if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })

  const callSid = formParams['CallSid']
  const callStatus = formParams['CallStatus']
  if (!callSid) return NextResponse.json({ error: 'Missing CallSid' }, { status: 400 })

  if (sessionId) {
    const finalStatuses = ['completed', 'failed', 'busy', 'no-answer', 'canceled']
    if (finalStatuses.includes(callStatus)) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: {
          status: callStatus === 'completed' ? 'completed' : 'failed',
          completedAt: new Date(),
        },
      }).catch(() => {})
    }
  }

  if (leadId) {
    const leadStatusMap: Record<string, string> = {
      completed: 'COMPLETED',
      busy: 'BUSY',
      'no-answer': 'NO_ANSWER',
      failed: 'FAILED',
      canceled: 'REJECTED',
    }
    const leadStatus = leadStatusMap[callStatus]
    if (leadStatus) {
      await prisma.lead.update({ where: { id: leadId }, data: { callStatus: leadStatus } }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
