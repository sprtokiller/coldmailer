import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { canEditNegotiation } from '~/server/utils/projectPermissions'

/**
 * Toggle a single checklist line in myToThem or themToUs.
 * Body: { field: 'myToThem' | 'themToUs', lineIndex: number }
 *
 * Each line is stored as markdown checklist: "- [ ] text" or "- [x] text".
 * This endpoint toggles between the two states for the given line index.
 */
export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const canEdit = await canEditNegotiation(session.id, projectId, globalRecordId)
  if (!canEdit) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění editovat toto jednání. Nejste přiřazeni k tomuto partnerovi.' })
  }

  const body = await readBody<{
    field: 'myToThem' | 'themToUs'
    lineIndex: number
  }>(event)

  if (!body.field || !['myToThem', 'themToUs'].includes(body.field)) {
    throw createError({ statusCode: 400, message: 'Pole (field) musí být "myToThem" nebo "themToUs".' })
  }

  if (typeof body.lineIndex !== 'number' || body.lineIndex < 0) {
    throw createError({ statusCode: 400, message: 'lineIndex musí být nezáporné číslo.' })
  }

  const negotiation = await prisma.negotiation.findUnique({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
  })
  if (!negotiation) {
    throw createError({ statusCode: 404, message: 'Jednání nebylo nalezeno.' })
  }

  const currentValue = negotiation[body.field]
  if (!currentValue) {
    throw createError({ statusCode: 400, message: 'Pole je prázdné, nelze přepnout.' })
  }

  const lines = currentValue.split('\n')
  if (body.lineIndex >= lines.length) {
    throw createError({ statusCode: 400, message: 'lineIndex je mimo rozsah.' })
  }

  const line = lines[body.lineIndex]

  // Toggle: - [ ] <-> - [x]
  if (/^- \[x\]\s*/i.test(line)) {
    lines[body.lineIndex] = line.replace(/^- \[x\]/i, '- [ ]')
  } else if (/^- \[ \]\s*/.test(line)) {
    lines[body.lineIndex] = line.replace('- [ ]', '- [x]')
  } else {
    // Line doesn't have checklist syntax — shouldn't happen after normalization but handle gracefully
    throw createError({ statusCode: 400, message: 'Řádek nemá checklist formát.' })
  }

  const newValue = lines.join('\n')

  // Track co-authorship
  const isAlreadyAssignee = await prisma.fulfillmentAssignee.findUnique({
    where: { negotiationId_userId: { negotiationId: negotiation.id, userId: session.id } },
  })
  if (!isAlreadyAssignee) {
    await prisma.fulfillmentAssignee.create({
      data: { negotiationId: negotiation.id, userId: session.id },
    }).catch(() => {})
  }

  const updated = await prisma.negotiation.update({
    where: { id: negotiation.id },
    data: { [body.field]: newValue },
    select: {
      id: true,
      myToThem: true,
      themToUs: true,
    },
  })

  return updated
})
