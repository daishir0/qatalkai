import { prisma } from './prisma'

export async function getSetting(key: string): Promise<string> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } })
  return setting?.value || ''
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  })
  const map: Record<string, string> = {}
  for (const s of settings) map[s.key] = s.value
  return map
}
