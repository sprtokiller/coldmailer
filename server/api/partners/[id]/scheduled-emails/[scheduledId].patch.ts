import { prisma } from '~/server/utils/prisma'
import { requireScheduledEmailAccess } from '~/server/utils/scheduled-email-access'

interface UpdateBody {
  toAddress?: string
  subject?: string
  body?: string
  scheduledFor?: string
}

export default defineEventHandler(async (event) => {
  const { scheduledId, existing } = await requireScheduledEmailAccess(event)

  if (existing.status !== 'PENDING') {
    throw createError({ statusCode: 400, message: 'Tento e-mail už není možné upravit.' })
  }

  const body = await readBody<UpdateBody>(event)
  const data: Record<string, unknown> = {}

  if (body.toAddress !== undefined) {
    if (!body.toAddress.trim()) throw createError({ statusCode: 400, message: 'toAddress je povinné.' })
    data.toAddress = body.toAddress.trim()
  }
  if (body.subject !== undefined) {
    if (!body.subject.trim()) throw createError({ statusCode: 400, message: 'subject je povinné.' })
    data.subject = body.subject.trim()
  }
  if (body.body !== undefined) {
    if (!body.body.trim()) throw createError({ statusCode: 400, message: 'body je povinné.' })
    data.body = body.body
  }
  if (body.scheduledFor !== undefined) {
    const scheduledFor = new Date(body.scheduledFor)
    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now()) {
      throw createError({ statusCode: 400, message: 'Naplánovaný čas musí být v budoucnosti.' })
    }
    data.scheduledFor = scheduledFor
  }

  const result = await prisma.scheduledEmail.updateMany({
    where: { id: scheduledId, status: 'PENDING' },
    data,
  })
  if (result.count === 0) {
    throw createError({ statusCode: 400, message: 'Tento e-mail už není možné upravit — právě se odesílá nebo už byl odeslán.' })
  }

  return prisma.scheduledEmail.findUnique({
    where: { id: scheduledId },
    include: { createdBy: { select: { id: true, name: true, image: true } } },
  })
})
