import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { findOrCreateGlobalRecord } from '~/server/utils/global-record'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const stepId = getRouterParam(event, 'stepId')!
  const { name, url, type = 'COMPETITION' } = await readBody<{ name: string; url?: string; type?: string }>(event)
  if (!name?.trim()) throw createError({ statusCode: 400, statusMessage: 'name required' })

  const step = await prisma.pipelineStep.findUnique({ where: { id: stepId } })
  if (!step) throw createError({ statusCode: 404 })

  const inputSource = await prisma.inputSource.create({
    data: {
      type: 'MANUAL_ADD',
      pipelineRunId: runId,
      stepId,
      label: `Ručně – ${new Date().toLocaleString('cs-CZ')}`,
      createdBy: user.id,
    },
  })

  await findOrCreateGlobalRecord(
    {
      name: name.trim(),
      url: url?.trim() || undefined,
      type: type as 'COMPETITION' | 'PARTNER',
      payload: { name: name.trim(), url: url?.trim() ?? null },
    },
    user.id, runId, stepId, inputSource.id, 'MANUAL'
  )

  return { ok: true }
})
