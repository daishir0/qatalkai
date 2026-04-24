import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/lib/settings'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ shortId: string }> }) {
  const { shortId } = await ctx.params
  const project = await prisma.project.findUnique({
    where: { shortId },
    select: { id: true, name: true, shortId: true, description: true, isActive: true, defaultMode: true },
  })
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const settings = await getSettings(['show_transcription', 'enable_voice_conversation'])
  return NextResponse.json({
    ...project,
    showTranscription: settings.show_transcription !== 'false',
    enableVoiceConversation: settings.enable_voice_conversation !== 'false',
  })
}
