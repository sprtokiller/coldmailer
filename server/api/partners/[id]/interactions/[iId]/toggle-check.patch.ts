import { prisma } from '~/server/utils/prisma'
import { requireInteractionAccess } from '~/server/utils/projectPermissions'

/**
 * Toggle a single checklist line in myToThem or themToUs.
 * Body: { field: 'myToThem' | 'themToUs', lineIndex: number }
 *
 * Each line is stored as markdown checklist: "- [ ] text" or "- [x] text".
 * This endpoint toggles between the two states for the given line index.
 */
export default defineEventHandler(async (event) => {
  const iId = getRouterParam(event, 'iId')!
  const { session, interaction } = await requireInteractionAccess(event, iId, 'edit')

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

  const currentValue = interaction[body.field] as string | null
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
  const data: Record<string, any> = { [body.field]: newValue }
  const isCreator = interaction.createdBy === session.id
  const isAlreadyAssignee = interaction.assignees.some((a: any) => a.userId === session.id)
  if (!isCreator && !isAlreadyAssignee) {
    data.assignees = { create: { userId: session.id } }
  }

  const updated = await prisma.interaction.update({
    where: { id: iId },
    data,
    select: {
      id: true,
      myToThem: true,
      themToUs: true,
    },
  })

  return updated
})
