import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { canEditNegotiation } from '~/server/utils/projectPermissions'
import { sendPartnerEmailNow } from '~/server/utils/send-partner-email'

const SIGNATURE_SEPARATOR = '<br><br><hr><br>'

interface SendEmailBody {
  toAddress: string
  subject: string
  body: string
  signatureContent?: string
  inReplyToGmailId?: string
  scheduledFor?: string // ISO datetime — if set and in the future, schedules instead of sending now
}

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  }

  const body = await readBody<SendEmailBody>(event)

  if (!body.toAddress || !body.subject || !body.body) {
    throw createError({ statusCode: 400, message: 'toAddress, subject a body jsou povinné.' })
  }

  const canEdit = await canEditNegotiation(session.id, projectId, globalRecordId)
  if (!canEdit) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění odeslat e-mail. Nejste přiřazeni k tomuto partnerovi.' })
  }

  const fullBody = body.signatureContent
    ? body.body + SIGNATURE_SEPARATOR + body.signatureContent
    : body.body

  if (body.scheduledFor) {
    const scheduledFor = new Date(body.scheduledFor)
    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now()) {
      throw createError({ statusCode: 400, message: 'Naplánovaný čas musí být v budoucnosti.' })
    }

    const scheduledEmail = await prisma.scheduledEmail.create({
      data: {
        projectId,
        globalRecordId,
        toAddress: body.toAddress,
        subject: body.subject,
        body: fullBody,
        inReplyToGmailId: body.inReplyToGmailId ?? null,
        scheduledFor,
        createdById: session.id,
      },
      include: { createdBy: { select: { id: true, name: true, image: true } } },
    })

    return { scheduled: true, scheduledEmail }
  }

  const interaction = await sendPartnerEmailNow({
    userId: session.id,
    projectId,
    globalRecordId,
    toAddress: body.toAddress,
    subject: body.subject,
    fullBody,
    inReplyToGmailId: body.inReplyToGmailId,
  })

  return { scheduled: false, interaction }
})
