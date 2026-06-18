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
    const duplicateOfId = await wouldCreateCycle(dedup.matchedRecordId)
      ? undefined
      : dedup.matchedRecordId
    try {
      const record = await prisma.globalRecord.create({
        data: {
          type: candidate.type,
          canonicalName: candidate.name,
          normalizedName: normalizedCandidateName,
          payload: candidate.payload as never,
          createdBy: userId,
          duplicateOfId,
        },
      })
      await prisma.pipelineRecordRef.create({
        data: { pipelineRunId, stepId, globalRecordId: record.id, inputSourceId, addedBy: userId, addMethod },
      })
      await logEvent({ globalRecordId: record.id, pipelineRunId, stepId, userId, eventType: 'DEDUP_REVIEW', metadata: { explanation: dedup.explanation } })
      return { globalRecordId: record.id, wasCreated: true }
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        return handleDuplicateConflict(candidate, pipelineRunId, stepId, inputSourceId, userId, addMethod)
      }
      throw err
    }
  }

  try {
    const record = await prisma.globalRecord.create({
      data: {
        type: candidate.type,
        canonicalName: candidate.name,
        normalizedName: normalizedCandidateName,
        payload: candidate.payload as never,
        createdBy: userId,
      },
    })
    await prisma.pipelineRecordRef.create({
      data: { pipelineRunId, stepId, globalRecordId: record.id, inputSourceId, addedBy: userId, addMethod },
    })
    await logEvent({ globalRecordId: record.id, pipelineRunId, stepId, userId, eventType: 'CREATED' })
    return { globalRecordId: record.id, wasCreated: true }
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return handleDuplicateConflict(candidate, pipelineRunId, stepId, inputSourceId, userId, addMethod)
    }
    throw err
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002'
}

async function handleDuplicateConflict(
  candidate: GlobalRecordCandidate,
  pipelineRunId: string,
  stepId: string,
  inputSourceId: string | undefined,
  userId: string,
  addMethod: AddMethod,
): Promise<{ globalRecordId: string; wasCreated: boolean }> {
  const existing = await prisma.globalRecord.findFirst({
    where: { type: candidate.type, normalizedName: normalizeName(candidate.name) },
    select: { id: true },
  })
  if (!existing) throw new Error('Unique constraint conflict but no existing record found')

  const ref = await prisma.pipelineRecordRef.findUnique({
    where: { pipelineRunId_stepId_globalRecordId: { pipelineRunId, stepId, globalRecordId: existing.id } },
  })
  if (!ref) {
    await prisma.pipelineRecordRef.create({
      data: { pipelineRunId, stepId, globalRecordId: existing.id, inputSourceId, addedBy: userId, addMethod },
    })
  }
  await logEvent({ globalRecordId: existing.id, pipelineRunId, stepId, userId, eventType: 'DEDUP_LINKED', metadata: { explanation: 'Resolved via unique constraint conflict' } })
  return { globalRecordId: existing.id, wasCreated: false }
}

async function wouldCreateCycle(targetId: string, maxDepth = 10): Promise<boolean> {
  let currentId: string | null = targetId
  const visited = new Set<string>()
  for (let i = 0; i < maxDepth && currentId; i++) {
    if (visited.has(currentId)) return true
    visited.add(currentId)
    const node: { duplicateOfId: string | null } | null = await prisma.globalRecord.findUnique({
      where: { id: currentId },
      select: { duplicateOfId: true },
    })
    currentId = node?.duplicateOfId ?? null
  }
  return false
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
      inputSource: { select: { id: true, label: true, type: true, pipelineRunId: true, metadata: true } },
    },
    orderBy: { addedAt: 'desc' },
  })
}

