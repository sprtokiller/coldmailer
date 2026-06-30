import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { mergeOutputData } from '~/server/utils/merge-output'

interface ImportProfilesBody {
  profiles: Array<Record<string, unknown>>
}

function normalizeProfiles(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> =>
    Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  )
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const body = await readBody<ImportProfilesBody | null>(event)
  const profiles = normalizeProfiles(body?.profiles)

  if (profiles.length === 0) {
    throw createError({ statusCode: 400, message: 'profiles must contain at least one profile object' })
  }

  const run = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { id: true } })
  if (!run) throw createError({ statusCode: 404, message: 'Pipeline run not found' })

  const existingStep = await prisma.pipelineStep.findFirst({
    where: { pipelineRunId: runId, stepType: 'PARTNER_PROFILING' },
    orderBy: { createdAt: 'desc' },
  })

  const mergedData = mergeOutputData(existingStep?.outputData ?? null, profiles, 'PARTNER_PROFILING')

  let stepId: string
  if (existingStep) {
    await prisma.pipelineStep.update({
      where: { id: existingStep.id },
      data: {
        status: 'COMPLETED',
        outputData: mergedData as never,
        errorMessage: null,
        completedAt: new Date(),
      },
    })
    stepId = existingStep.id
  } else {
    const created = await prisma.pipelineStep.create({
      data: {
        pipelineRunId: runId,
        stepType: 'PARTNER_PROFILING',
        status: 'COMPLETED',
        systemPromptId: null,
        contextPartIds: [],
        inputData: {},
        outputData: mergedData as never,
        runnerId: user.id,
        completedAt: new Date(),
      },
    })
    stepId = created.id
  }

  const { syncProfileContactsToDb } = await import('~/server/utils/sync-contacts')
  for (const profile of mergedData as Array<Record<string, unknown>>) {
    const pid = profile.partnerId as string | undefined
    if (!pid || profile.error) continue
    const { partnerId: _, error: __, raw: ___, ...profileData } = profile

    if (Array.isArray(profile.contacts)) {
      await syncProfileContactsToDb(pid, profile.contacts as any[])
    }

    await prisma.globalRecord.update({
      where: { id: pid },
      data: { payload: profileData as never },
    }).catch(() => {})
  }

  return { success: true, stepId }
})
