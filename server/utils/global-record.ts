import { prisma } from '~/server/utils/prisma'
import type { RecordType, AddMethod } from '@prisma/client'
import { checkDuplicate, normalizeName } from '~/server/utils/deduplication'
import { logEvent } from '~/server/utils/record-events'

interface GlobalRecordCandidate {
  name: string
  url?: string
  type: RecordType
  payload: Record<string, unknown>
}

interface StepRecordFilters {
  inputSourceId?: string
  search?: string
  isSelectedForProcessing?: boolean
}

const SOURCE_PRIORITY: Record<string, number> = {
  GENERATED: 3, IMPORTED: 2, GLOBAL_DB: 1, MANUAL: 1, INHERITED: 0,
}

export async function findOrCreateGlobalRecord(
  candidate: GlobalRecordCandidate,
  userId: string,
  pipelineRunId: string,
  stepId: string,
  inputSourceId: string | undefined,
  addMethod: AddMethod
): Promise<{ globalRecordId: string; wasCreated: boolean }> {
  const dedup = await checkDuplicate({ name: candidate.name, url: candidate.url, type: candidate.type })
  const newPriority = SOURCE_PRIORITY[addMethod] ?? 0

  if (dedup.matchStatus === 'exact_match' || (dedup.matchStatus === 'probable_match' && dedup.confidence >= 0.85)) {
    const globalRecordId = dedup.matchedRecordId!
    const existing = await prisma.pipelineRecordRef.findUnique({
      where: { pipelineRunId_stepId_globalRecordId: { pipelineRunId, stepId, globalRecordId } },
      select: { addMethod: true },
    })
    if (existing) {
      const existingPriority = SOURCE_PRIORITY[existing.addMethod] ?? 0
      if (newPriority > existingPriority) {
        await prisma.pipelineRecordRef.update({
          where: { pipelineRunId_stepId_globalRecordId: { pipelineRunId, stepId, globalRecordId } },
          data: { addMethod, inputSourceId },
        })
      }
    } else {
      await prisma.pipelineRecordRef.create({
        data: { pipelineRunId, stepId, globalRecordId, inputSourceId, addedBy: userId, addMethod },
      })
    }
    await logEvent({ globalRecordId, pipelineRunId, stepId, userId, eventType: 'DEDUP_LINKED', metadata: { explanation: dedup.explanation } })
    return { globalRecordId, wasCreated: false }
  }

  const normalizedCandidateName = normalizeName(candidate.name)

  if (dedup.matchStatus === 'possible_match' && dedup.matchedRecordId) {
    const record = await prisma.globalRecord.create({
      data: {
        type: candidate.type,
        canonicalName: candidate.name,
        normalizedName: normalizedCandidateName,
        payload: candidate.payload,
        createdBy: userId,
        duplicateOfId: dedup.matchedRecordId,
      },
    })
    await prisma.pipelineRecordRef.create({
      data: { pipelineRunId, stepId, globalRecordId: record.id, inputSourceId, addedBy: userId, addMethod },
    })
    await logEvent({ globalRecordId: record.id, pipelineRunId, stepId, userId, eventType: 'DEDUP_REVIEW', metadata: { explanation: dedup.explanation } })
    return { globalRecordId: record.id, wasCreated: true }
  }

  const record = await prisma.globalRecord.create({
    data: {
      type: candidate.type,
      canonicalName: candidate.name,
      normalizedName: normalizedCandidateName,
      payload: candidate.payload,
      createdBy: userId,
    },
  })
  await prisma.pipelineRecordRef.create({
    data: { pipelineRunId, stepId, globalRecordId: record.id, inputSourceId, addedBy: userId, addMethod },
  })
  await logEvent({ globalRecordId: record.id, pipelineRunId, stepId, userId, eventType: 'CREATED' })
  return { globalRecordId: record.id, wasCreated: true }
}

export async function updateRelevanceStatus(
  recordId: string,
  status: string,
  userId: string,
  pipelineRunId?: string,
): Promise<void> {
  const record = await prisma.globalRecord.findUnique({ where: { id: recordId } })
  if (!record) return
  const payload = { ...(record.payload as Record<string, unknown>), relevanceStatus: status }
  await prisma.globalRecord.update({
    where: { id: recordId },
    data: { payload: payload as never },
  })
  await logEvent({ globalRecordId: recordId, pipelineRunId, userId, eventType: 'STATUS_CHANGED', metadata: { status } })
}

export async function getStepRecords(stepId: string, filters: StepRecordFilters = {}) {
  return prisma.pipelineRecordRef.findMany({
    where: {
      stepId,
      ...(filters.isSelectedForProcessing !== undefined && { isSelectedForProcessing: filters.isSelectedForProcessing }),
      ...(filters.inputSourceId !== undefined && { inputSourceId: filters.inputSourceId }),
      ...(filters.search && { globalRecord: { canonicalName: { contains: filters.search, mode: 'insensitive' } } }),
    },
    include: {
      adder: { select: { name: true } },
      globalRecord: {
        include: {
          pipelineRefs: {
            select: {
              pipelineRunId: true,
              pipelineRun: { select: { name: true } },
            },
          },
        },
      },
      inputSource: { select: { id: true, label: true, type: true, pipelineRunId: true } },
    },
    orderBy: { addedAt: 'desc' },
  })
}

