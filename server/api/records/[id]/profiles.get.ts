import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { normalizeCompanyName } from '~/server/utils/merge-output'

type ProfileData = Record<string, unknown>

function asProfileData(value: unknown): ProfileData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as ProfileData
}

function hasProfileData(data: ProfileData): boolean {
  return Boolean(
    data.industry
    || data.summary
    || data.profile
    || (Array.isArray(data.contacts) && data.contacts.length > 0),
  )
}

function profileName(data: ProfileData): string {
  return String(data.name ?? data.partnerName ?? data.companyName ?? '')
}

function companyNamesMatch(a: string, b: string): boolean {
  const na = normalizeCompanyName(a)
  const nb = normalizeCompanyName(b)
  if (!na || !nb) return false
  return na === nb || na.startsWith(nb) || nb.startsWith(na)
}

function isProfileForRecord(data: ProfileData, globalRecordId: string, canonicalName: string): boolean {
  if (String(data.partnerId ?? '') === globalRecordId) return true
  return companyNamesMatch(profileName(data), canonicalName)
}

function withRecordIdentity(data: ProfileData, globalRecordId: string, canonicalName: string): ProfileData {
  return {
    ...data,
    partnerId: data.partnerId ?? globalRecordId,
    name: data.name ?? canonicalName,
  }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!

  const record = await prisma.globalRecord.findUnique({
    where: { id },
    select: {
      id: true,
      canonicalName: true,
      payload: true,
      updatedAt: true,
      pipelineRefs: { select: { pipelineRunId: true } },
    },
  })

  if (!record) throw createError({ statusCode: 404, message: 'GlobalRecord not found' })

  const currentPayload = asProfileData(record.payload)
  const current = currentPayload && hasProfileData(currentPayload)
    ? {
        data: withRecordIdentity(currentPayload, record.id, record.canonicalName),
        updatedAt: record.updatedAt.toISOString(),
      }
    : null

  const runIds = [...new Set(record.pipelineRefs.map(ref => ref.pipelineRunId))]
  if (runIds.length === 0) return { current, historical: [] }

  const steps = await prisma.pipelineStep.findMany({
    where: {
      pipelineRunId: { in: runIds },
      stepType: 'PARTNER_PROFILING',
      status: 'COMPLETED',
    },
    include: {
      pipelineRun: { select: { name: true } },
      runner: { select: { name: true } },
    },
    orderBy: { completedAt: 'desc' },
  })

  const historical = steps.flatMap((step) => {
    const profiles = Array.isArray(step.outputData) ? step.outputData : []
    return profiles
      .map(asProfileData)
      .filter((profile): profile is ProfileData => Boolean(profile))
      .filter(profile => isProfileForRecord(profile, record.id, record.canonicalName))
      .map(profile => ({
        stepId: step.id,
        pipelineRunName: step.pipelineRun.name,
        runnerName: step.runner.name,
        completedAt: (step.completedAt ?? step.createdAt).toISOString(),
        data: withRecordIdentity(profile, record.id, record.canonicalName),
      }))
  })

  return { current, historical }
})
