import { prisma } from '~/server/utils/prisma'
import type { RecordType, RelevanceStatus, AddMethod } from '@prisma/client'
import { checkDuplicate, normalizeName } from '~/server/utils/deduplication'
import { logEvent } from '~/server/utils/record-events'

interface GlobalRecordCandidate {
  name: string
  url?: string
  type: RecordType
  payload: Record<string, unknown>
}

interface StepRecordFilters {
  relevanceStatus?: RelevanceStatus
  inputSourceId?: string
  search?: string
  isSelectedForProcessing?: boolean
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

  if (dedup.matchStatus === 'exact_match' || (dedup.matchStatus === 'probable_match' && dedup.confidence >= 0.85)) {
    const globalRecordId = dedup.matchedRecordId!
    await prisma.pipelineRecordRef.upsert({
      where: { pipelineRunId_stepId_globalRecordId: { pipelineRunId, stepId, globalRecordId } },
      create: { pipelineRunId, stepId, globalRecordId, inputSourceId, addedBy: userId, addMethod },
      update: {},
    })
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
        relevanceStatus: 'UNCERTAIN',
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

  // unique
  const record = await prisma.globalRecord.create({
    data: {
      type: candidate.type,
      canonicalName: candidate.name,
      normalizedName: normalizedCandidateName,
      payload: candidate.payload,
      relevanceStatus: 'UNCERTAIN',
      createdBy: userId,
    },
  })
  await prisma.pipelineRecordRef.create({
    data: { pipelineRunId, stepId, globalRecordId: record.id, inputSourceId, addedBy: userId, addMethod },
  })
  await logEvent({ globalRecordId: record.id, pipelineRunId, stepId, userId, eventType: 'CREATED' })
  return { globalRecordId: record.id, wasCreated: true }
}

export async function getStepRecords(stepId: string, filters: StepRecordFilters = {}) {
  return prisma.pipelineRecordRef.findMany({
    where: {
      stepId,
      ...(filters.isSelectedForProcessing !== undefined && { isSelectedForProcessing: filters.isSelectedForProcessing }),
      ...(filters.relevanceStatus !== undefined && { globalRecord: { relevanceStatus: filters.relevanceStatus } }),
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

export async function updateRelevanceStatus(
  globalRecordId: string,
  status: RelevanceStatus,
  userId: string,
  pipelineRunId?: string
): Promise<void> {
  await prisma.globalRecord.update({
    where: { id: globalRecordId },
    data: { relevanceStatus: status },
  })
  await logEvent({ globalRecordId, pipelineRunId, userId, eventType: 'RELEVANCE_SET', metadata: { status } })
}
