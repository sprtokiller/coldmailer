import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { STEP_SYSTEM_PROMPTS, STEP_OUTPUT_SCHEMAS, formatSchemaForPrompt } from '~/config/pipeline'
import { libraryScopeForProject } from '~/server/utils/libraryScope'

interface GeneratePromptBody {
  stepType: string
  systemPromptId?: string
  contextPartIds?: string[]
  manualContext?: string
  sellingPointId?: string
  partnerData?: {
    name: string
    website?: string | null
    description?: string | null
    type?: string | null
    frequency?: number
    itemNames?: string[]
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const body = await readBody<GeneratePromptBody>(event)

  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: { project: { include: { group: true } } },
  })
  if (!run) throw createError({ statusCode: 404, message: 'Run not found' })

  const scopeFilter = libraryScopeForProject(run.project)

  const [contextParts, customPrompt, dbSystemPrompt, sellingPoint] = await Promise.all([
    body.contextPartIds?.length
      ? prisma.contextPart.findMany({ where: { id: { in: body.contextPartIds }, ...scopeFilter } })
      : Promise.resolve([]),
    body.systemPromptId
      ? prisma.systemPrompt.findFirst({
          where: {
            id: body.systemPromptId,
            OR: [{ isSystem: true }, { isSystem: false, ...scopeFilter }],
          },
        })
      : Promise.resolve(null),
    prisma.systemPrompt.findFirst({
      where: { stepType: body.stepType as never, isSystem: true },
      orderBy: { createdAt: 'desc' },
    }),
    body.sellingPointId
      ? prisma.sellingPoint.findFirst({ where: { id: body.sellingPointId, ...scopeFilter } })
      : Promise.resolve(null),
  ])

  const rawPromptText =
    customPrompt?.content ??
    dbSystemPrompt?.content ??
    STEP_SYSTEM_PROMPTS[body.stepType] ??
    'You are a helpful assistant.'

  const outputSchema =
    (customPrompt?.outputSchema as object | null) ??
    (dbSystemPrompt?.outputSchema as object | null) ??
    STEP_OUTPUT_SCHEMAS[body.stepType] ??
    null

  const systemPrompt = outputSchema
    ? rawPromptText.replace('<[[SCHEMA]]>', formatSchemaForPrompt(outputSchema))
    : rawPromptText

  let industryTagsContext: string[] = []
  if (body.stepType === 'PARTNER_PROFILING') {
    const tagRow = await prisma.systemConfig.findUnique({ where: { key: 'tags.partnerIndustry' } })
    const tags = Array.isArray(tagRow?.value) ? tagRow!.value as string[] : []
    if (tags.length > 0) {
      industryTagsContext = [`Povolené hodnoty pro pole "industry" (vyber JEDNU z tohoto seznamu):\n${tags.join(', ')}`]
    }
  }

  const allContextParts = [
    ...contextParts.map(c => `${c.name}:\n${c.content}`),
    ...(sellingPoint ? [`Prodejní argumenty (${sellingPoint.name}):\n${sellingPoint.content}`] : []),
    ...(body.manualContext?.trim() ? [`Vlastní kontext:\n${body.manualContext}`] : []),
    ...industryTagsContext,
  ]

  let userMessage = ''
  if (body.stepType === 'PARTNER_PROFILING' && body.partnerData) {
    const pd = body.partnerData
    userMessage = [
      'Prozkoumej tohoto kandidáta na partnerství a vrať strukturovaný JSON definovaný v systémovém promptu. Veškerá textová pole piš v češtině.',
      '',
      `Název: ${pd.name}`,
      pd.website     ? `Web: ${pd.website}` : null,
      pd.description ? `Popis: ${pd.description}` : null,
      pd.type        ? `Typ partnerství: ${pd.type}` : null,
      pd.frequency   ? `Nalezen v ${pd.frequency} kontextu/kontextech: ${(pd.itemNames ?? []).join(', ')}` : null,
    ].filter(Boolean).join('\n')
  } else if (body.stepType === 'MARKET_SCANNING') {
    userMessage = 'Prozkoumej trh a najdi relevantní soutěže dle pokynů v systémovém promptu. Výstup vrať jako JSON pole.'
  }

  const contextBlock = allContextParts.length
    ? `\n\n<context>\n${allContextParts.join('\n\n')}\n</context>`
    : ''

  const fullPrompt = [
    '[Systémový prompt]',
    systemPrompt + contextBlock,
    '',
    '[Uživatelská zpráva]',
    userMessage,
  ].filter(s => s !== '[Uživatelská zpráva]\n').join('\n')

  return { systemPrompt: systemPrompt + contextBlock, userMessage, fullPrompt }
})
