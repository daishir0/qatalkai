import { prisma } from './prisma'
import { getTwilioClient, getTwilioPhoneNumber } from './twilio'
import { getSetting, getSettings } from './settings'
import { startSession } from './conversation-engine'

export interface ProgressEvent {
  type: 'progress' | 'call_start' | 'call_end' | 'error' | 'project_end'
  projectId: string
  data: Record<string, unknown>
  timestamp: string
}

export type ExecutionStatus = 'running' | 'paused' | 'stopped'

export interface ProjectExecution {
  projectId: string
  status: ExecutionStatus
  currentCallSid: string | null
  currentLeadId: string | null
  progress: { total: number; completed: number; failed: number; pending: number }
  listeners: Set<(event: ProgressEvent) => void>
}

const activeExecutions = new Map<string, ProjectExecution>()

function emit(execution: ProjectExecution, event: ProgressEvent) {
  for (const l of execution.listeners) {
    try { l(event) } catch { /* ignore */ }
  }
}

function makeEvent(execution: ProjectExecution, type: ProgressEvent['type'], data: Record<string, unknown> = {}): ProgressEvent {
  return {
    type,
    projectId: execution.projectId,
    data: { ...execution.progress, ...data },
    timestamp: new Date().toISOString(),
  }
}

async function computeProgress(projectId: string) {
  const counts = await prisma.lead.groupBy({
    by: ['callStatus'],
    where: { projectId, phoneNumber: { not: null } },
    _count: true,
  })
  let total = 0, completed = 0, failed = 0, pending = 0
  for (const c of counts) {
    total += c._count
    if (c.callStatus === 'COMPLETED') completed += c._count
    else if (['FAILED', 'NO_ANSWER', 'BUSY', 'REJECTED'].includes(c.callStatus)) failed += c._count
    else if (c.callStatus === 'PENDING') pending += c._count
  }
  return { total, completed, failed, pending }
}

async function executeCall(execution: ProjectExecution, leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead || !lead.phoneNumber) return

  const settings = await getSettings(['base_url', 'twilio_live_calls_enabled'])
  const baseUrl = settings.base_url
  const liveCallsEnabled = settings.twilio_live_calls_enabled === 'true' || settings.twilio_live_calls_enabled === '1'

  await prisma.lead.update({ where: { id: leadId }, data: { callStatus: 'CALLING' } })

  const session = await startSession({
    projectId: execution.projectId,
    leadId,
    mode: 'phone',
    metadata: liveCallsEnabled ? { channel: 'twilio' } : { channel: 'twilio-disabled' },
  })

  if (!liveCallsEnabled) {
    // Guard: Twilio 実発信が無効化されている（twilio_live_calls_enabled=false）
    // セッションとリード状態だけ完了扱いにして実発信はスキップ
    await prisma.lead.update({ where: { id: leadId }, data: { callStatus: 'COMPLETED' } })
    await prisma.conversationSession.update({
      where: { id: session.id },
      data: { status: 'completed', completedAt: new Date(), metadata: { channel: 'twilio-disabled', reason: 'twilio_live_calls_enabled=false' } },
    })
    emit(execution, makeEvent(execution, 'call_end', { leadId, sessionId: session.id, finalStatus: 'completed', skipped: true }))
    return
  }

  try {
    const twilioClient = await getTwilioClient()
    const fromNumber = await getTwilioPhoneNumber()
    const call = await twilioClient.calls.create({
      to: lead.phoneNumber,
      from: fromNumber,
      url: `${baseUrl}/api/twilio/voice?sessionId=${session.id}`,
      statusCallback: `${baseUrl}/api/twilio/status?sessionId=${session.id}&leadId=${leadId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      method: 'POST',
    })
    await prisma.conversationSession.update({ where: { id: session.id }, data: { twilioCallSid: call.sid } })

    execution.currentCallSid = call.sid
    execution.currentLeadId = leadId
    emit(execution, makeEvent(execution, 'call_start', { leadId, sessionId: session.id, callSid: call.sid, phoneNumber: lead.phoneNumber, name: lead.displayName }))

    await waitForCompletion(execution, session.id, leadId)
  } catch (error) {
    const err = error as { message?: string; code?: number | string; status?: number; moreInfo?: string }
    const msg = err?.message || String(error)
    const code = err?.code != null ? String(err.code) : null
    const details = [
      code ? `code=${code}` : null,
      err?.status ? `status=${err.status}` : null,
      err?.moreInfo ? `info=${err.moreInfo}` : null,
    ].filter(Boolean).join(' ')
    const fullMessage = details ? `${msg} (${details})` : msg
    console.error('[call-engine] Twilio call failed', { leadId, sessionId: session.id, phoneNumber: lead.phoneNumber, message: msg, code, status: err?.status, moreInfo: err?.moreInfo })
    await prisma.lead.update({ where: { id: leadId }, data: { callStatus: 'FAILED' } })
    await prisma.conversationSession.update({
      where: { id: session.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        metadata: { channel: 'twilio', error: fullMessage, code, status: err?.status ?? null, moreInfo: err?.moreInfo ?? null },
      },
    })
    emit(execution, makeEvent(execution, 'error', { leadId, error: fullMessage }))
  }
}

async function waitForCompletion(execution: ProjectExecution, sessionId: string, leadId: string): Promise<void> {
  const maxWait = 5 * 60_000
  const poll = 2000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    if (execution.status === 'stopped') return
    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (lead && ['COMPLETED', 'FAILED', 'BUSY', 'NO_ANSWER', 'REJECTED'].includes(lead.callStatus)) {
      execution.currentCallSid = null
      execution.currentLeadId = null
      execution.progress = await computeProgress(execution.projectId)
      emit(execution, makeEvent(execution, 'call_end', { leadId, sessionId, finalStatus: lead.callStatus }))
      return
    }
    await new Promise((r) => setTimeout(r, poll))
  }
  execution.currentCallSid = null
  execution.currentLeadId = null
  await prisma.lead.update({ where: { id: leadId }, data: { callStatus: 'FAILED' } })
}

async function runLoop(execution: ProjectExecution): Promise<void> {
  try {
    while (execution.status === 'running') {
      const next = await prisma.lead.findFirst({
        where: { projectId: execution.projectId, callStatus: 'PENDING', phoneNumber: { not: null } },
        orderBy: { createdAt: 'asc' },
      })
      if (!next) break
      if (execution.status !== 'running') break
      await executeCall(execution, next.id)
      execution.progress = await computeProgress(execution.projectId)
      emit(execution, makeEvent(execution, 'progress'))
      if (execution.status === 'running') {
        await new Promise((r) => setTimeout(r, 3000))
      }
      while ((execution.status as ExecutionStatus) === 'paused') await new Promise((r) => setTimeout(r, 1000))
    }
    execution.progress = await computeProgress(execution.projectId)
    emit(execution, makeEvent(execution, 'project_end'))
  } finally {
    activeExecutions.delete(execution.projectId)
  }
}

export async function startProject(projectId: string): Promise<ProjectExecution> {
  if (activeExecutions.has(projectId)) throw new Error('Project already running')
  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) throw new Error('Project not found')

  const execution: ProjectExecution = {
    projectId,
    status: 'running',
    currentCallSid: null,
    currentLeadId: null,
    progress: await computeProgress(projectId),
    listeners: new Set(),
  }
  activeExecutions.set(projectId, execution)
  runLoop(execution)
  return execution
}

export function stopProject(projectId: string): void {
  const e = activeExecutions.get(projectId)
  if (e) {
    e.status = 'stopped'
    emit(e, makeEvent(e, 'project_end', { reason: 'kill_switch' }))
  }
}

export async function callSingleLead(projectId: string, leadId: string): Promise<void> {
  const e: ProjectExecution = {
    projectId,
    status: 'running',
    currentCallSid: null,
    currentLeadId: null,
    progress: await computeProgress(projectId),
    listeners: activeExecutions.get(projectId)?.listeners ?? new Set(),
  }
  await executeCall(e, leadId)
}

export function subscribeProgress(projectId: string, listener: (e: ProgressEvent) => void): () => void {
  let e = activeExecutions.get(projectId)
  if (!e) {
    e = {
      projectId,
      status: 'stopped',
      currentCallSid: null,
      currentLeadId: null,
      progress: { total: 0, completed: 0, failed: 0, pending: 0 },
      listeners: new Set(),
    }
    activeExecutions.set(projectId, e)
  }
  e.listeners.add(listener)
  return () => {
    e!.listeners.delete(listener)
    if (e!.listeners.size === 0 && e!.status === 'stopped') activeExecutions.delete(projectId)
  }
}

export function getExecution(projectId: string): ProjectExecution | null {
  return activeExecutions.get(projectId) ?? null
}

export function isRunning(projectId: string): boolean {
  const e = activeExecutions.get(projectId)
  return e?.status === 'running' || e?.status === 'paused' || false
}

// Helper for settings import to avoid unused warning in IDE during refactor
export { getSetting }
