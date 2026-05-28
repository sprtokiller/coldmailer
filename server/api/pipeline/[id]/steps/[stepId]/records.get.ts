import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getStepRecords } from '~/server/utils/global-record'

// Shapes legacy outputData items into the same envelope the overlay expects
function legacyRecordsFromOutputData(step: { id: string; stepType: string; outputData: unknown }, search?: string) {
  type SyntheticRef = {
    id: string
    globalRecordId: string
    isSelectedForProcessing: boolean
    addMethod: string
    localNote: null
    addedAt: string
    inputSource: null
    globalRecord: {
      id: string
      canonicalName: string
      type: string
      payload: Record<string, unknown>
      pipelineRefs: Array<{ pipelineRunId: string }>
    }
  }

  const items: SyntheticRef[] = []

  if (step.stepType === 'MARKET_SCANNING' && Array.isArray(step.outputData)) {
    for (const item of step.outputData as Record<string, unknown>[]) {
      const name = String(item.name ?? item.nazev ?? item.itemName ?? '')
      if (!name) continue
      if (search && !name.toLowerCase().includes(search.toLowerCase())) continue
      items.push({
        id: `legacy-ms-${name.slice(0, 20)}`,
        globalRecordId: `legacy-${name.slice(0, 20)}`,
        isSelectedForProcessing: true,
        addMethod: 'GENERATED',
        localNote: null,
        addedAt: new Date(0).toISOString(),
        inputSource: null,
        globalRecord: {
          id: `legacy-${name.slice(0, 20)}`,
          canonicalName: name,
          type: 'COMPETITION',
          payload: item,
          pipelineRefs: [],
        },
      })
    }
  }

  if (step.stepType === 'PARTNER_IDENTIFICATION') {
    const piItems = (step.outputData as { items?: unknown[] } | null)?.items ?? []
    const seen = new Set<string>()
    for (const piItem of piItems as Array<{ itemName?: string; partners?: Array<{ partnerId: string; name: string }> }>) {
      for (const partner of piItem.partners ?? []) {
        if (!partner.name || seen.has(partner.partnerId)) continue
        if (search && !partner.name.toLowerCase().includes(search.toLowerCase())) continue
        seen.add(partner.partnerId)
        items.push({
          id: `legacy-pi-${partner.partnerId}`,
          globalRecordId: `legacy-${partner.partnerId}`,
          isSelectedForProcessing: true,
          addMethod: 'GENERATED',
          localNote: null,
          addedAt: new Date(0).toISOString(),
          inputSource: null,
          globalRecord: {
            id: `legacy-${partner.partnerId}`,
            canonicalName: partner.name,
            type: 'PARTNER',
            payload: { partnerId: partner.partnerId, name: partner.name, itemName: piItem.itemName },
            pipelineRefs: [],
          },
        })
      }
    }
  }

  return items
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const stepId = getRouterParam(event, 'stepId')!
  const query = getQuery(event)

  const step = await prisma.pipelineStep.findUnique({ where: { id: stepId } })
  if (!step) throw createError({ statusCode: 404, statusMessage: 'Step not found' })

  const refs = await getStepRecords(stepId, {
    inputSourceId: query.inputSourceId as string | undefined,
    search: query.search as string | undefined,
    isSelectedForProcessing: query.isSelectedForProcessing !== undefined
      ? query.isSelectedForProcessing === 'true'
      : undefined,
  })

  // If we have real GlobalRecord refs, return them
  if (refs.length > 0) return refs

  // Fallback: synthesise from outputData for legacy runs
  return legacyRecordsFromOutputData(step, query.search as string | undefined)
})
