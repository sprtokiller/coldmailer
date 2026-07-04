import { prisma } from '~/server/utils/prisma'
import { requireAdmin } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event)
  const targetUserId = getRouterParam(event, 'id')!

  const user = await prisma.user.findUnique({ where: { id: targetUserId, googleId: { not: 'system' } } })
  if (!user) throw createError({ statusCode: 404, message: 'Uživatel nenalezen' })

  if (targetUserId === session.id) {
    throw createError({ statusCode: 400, message: 'Nelze smazat sám sebe.' })
  }

  if (user.isAdmin) {
    const otherAdminCount = await prisma.user.count({
      where: { isAdmin: true, id: { not: targetUserId }, googleId: { not: 'system' } },
    })
    if (otherAdminCount === 0) {
      throw createError({ statusCode: 400, message: 'Nelze smazat posledního admina. Nejprve přidělte admin status jinému uživateli.' })
    }
  }

  const counts = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      _count: {
        select: {
          systemPrompts: true,
          contextParts: true,
          sellingPoints: true,
          emailDrafts: true,
          signatures: true,
          globalRecords: true,
          recordEvents: true,
          interactionsCreated: true,
          interactionAssignments: true,
          partnerAlignments: true,
          outreachDraftsSaved: true,
          outreachAssignments: true,
          negotiationAssignments: true,
        },
      },
    },
  })

  const blockers: Record<string, string> = {
    systemPrompts: 'systémové prompty',
    contextParts: 'kontextové části',
    sellingPoints: 'prodejní argumenty',
    emailDrafts: 'e-mailové drafty',
    signatures: 'podpisy',
    globalRecords: 'záznamy partnerů',
    recordEvents: 'události záznamů',
    interactionsCreated: 'interakce',
    interactionAssignments: 'přiřazení interakcí',
    partnerAlignments: 'value alignmenty',
    outreachDraftsSaved: 'uložené outreach drafty',
    outreachAssignments: 'přiřazení outreach',
    negotiationAssignments: 'přiřazení k jednání',
  }

  const blocking = Object.entries(counts?._count ?? {})
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${blockers[key]} (${count})`)

  if (blocking.length > 0) {
    throw createError({
      statusCode: 400,
      message: `Nelze smazat uživatele — má navázaná data: ${blocking.join(', ')}. Nejprve je přeřaďte nebo smažte.`,
    })
  }

  await prisma.user.delete({ where: { id: targetUserId } })

  return { ok: true }
})
