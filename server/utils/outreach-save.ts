import { Prisma } from '@prisma/client'
import { prisma } from '~/server/utils/prisma'

export function matchPartnerName(entry: Record<string, unknown>, partnerName: string): boolean {
  return String(entry.partnerName ?? entry.name ?? '') === partnerName
}

export async function upsertOutreachEntry(
  runId: string,
  userId: string,
  userName: string,
  partnerName: string,
  fields: Record<string, unknown>,
): Promise<{ stepId: string; entry: Record<string, unknown> }> {
  let step = await prisma.pipelineStep.findFirst({
    where: { pipelineRunId: runId, stepType: 'OUTREACH_PREPARATION', status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
  })

  if (!step) {
    step = await prisma.pipelineStep.create({
      data: {
        pipelineRunId: runId,
        stepType: 'OUTREACH_PREPARATION',
        status: 'COMPLETED',
        outputData: [] as unknown as Prisma.InputJsonValue,
        runnerId: userId,
        completedAt: new Date(),
      },
    })
  }

  const outputData = (Array.isArray(step.outputData) ? step.outputData : []) as Array<Record<string, unknown>>
  const idx = outputData.findIndex(e => matchPartnerName(e, partnerName))

  const entry = {
    ...(idx >= 0 ? outputData[idx] : {}),
    partnerName,
    ...fields,
    savedBy: { id: userId, name: userName },
    savedAt: new Date().toISOString(),
  }

  if (idx >= 0) outputData[idx] = entry
  else outputData.push(entry)

  await prisma.pipelineStep.update({
    where: { id: step.id },
    data: { outputData: outputData as unknown as Prisma.InputJsonValue },
  })

  return { stepId: step.id, entry }
}

export async function markOutreachSent(
  stepId: string,
  partnerName: string,
  sentFields: Record<string, unknown>,
): Promise<void> {
  const step = await prisma.pipelineStep.findUnique({ where: { id: stepId } })
  if (!step) return
  const data = (Array.isArray(step.outputData) ? step.outputData : []) as Array<Record<string, unknown>>
  const i = data.findIndex(e => matchPartnerName(e, partnerName))
  if (i >= 0) {
    data[i] = { ...data[i], ...sentFields }
    await prisma.pipelineStep.update({
      where: { id: stepId },
      data: { outputData: data as unknown as Prisma.InputJsonValue },
    })
  }
}

export async function markOutreachError(
  stepId: string,
  partnerName: string,
  error: string,
): Promise<void> {
  await markOutreachSent(stepId, partnerName, {
    sendError: error,
    sendErrorAt: new Date().toISOString(),
  })
}

