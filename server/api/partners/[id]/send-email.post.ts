import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { canEditNegotiation } from '~/server/utils/projectPermissions'
import { sendGmailMessage, refreshAccessToken, getGmailMessage } from '~/server/utils/google'
import { trackCustomRecipientAddress } from '~/server/utils/project-additional-addresses'
import { assignNegotiationOnSend } from '~/server/utils/negotiation-assignment'

const SIGNATURE_SEPARATOR = '<br><br><hr><br>'

interface SendEmailBody {
  toAddress: string
  subject: string
  body: string
  signatureContent?: string
  inReplyToGmailId?: string
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

  const dbUser = await prisma.user.findUnique({ where: { id: session.id } })
  if (!dbUser?.accessToken) {
    throw createError({ statusCode: 400, message: 'Chybí Google přihlašovací token. Přihlaste se znovu.' })
  }

  let accessToken = dbUser.accessToken
  if (dbUser.refreshToken && (!dbUser.tokenExpiry || dbUser.tokenExpiry < new Date())) {
    const config = useRuntimeConfig()
    const refreshed = await refreshAccessToken(dbUser.refreshToken, config.googleClientId, config.googleClientSecret)
    accessToken = refreshed.access_token
    await prisma.user.update({
      where: { id: session.id },
      data: { accessToken: refreshed.access_token, tokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000) },
    })
  }

  const fullBody = body.signatureContent
    ? body.body + SIGNATURE_SEPARATOR + body.signatureContent
    : body.body

  let threading: { threadId: string; inReplyTo: string; references: string } | undefined

  if (body.inReplyToGmailId) {
    try {
      const origMsg = await getGmailMessage(accessToken, body.inReplyToGmailId, 'metadata')
      const rfcMessageId = (origMsg.payload.headers ?? []).find(h => h.name.toLowerCase() === 'message-id')?.value
      if (rfcMessageId && origMsg.threadId) {
        threading = { threadId: origMsg.threadId, inReplyTo: rfcMessageId, references: rfcMessageId }
      }
    } catch {
      // Threading info unavailable — send without thread linking
    }
  }

  const result = await sendGmailMessage(accessToken, body.toAddress, body.subject, fullBody, threading)

  await trackCustomRecipientAddress(projectId, globalRecordId, body.toAddress)

  await assignNegotiationOnSend(projectId, globalRecordId, session.id)

  const interaction = await prisma.interaction.create({
    data: {
      globalRecordId,
      projectId,
      type: 'EMAIL',
      direction: 'SENT',
      subject: body.subject,
      sentAt: new Date(),
      fromAddress: dbUser.email,
      toAddress: body.toAddress,
      gmailId: result.id,
      content: fullBody,
      createdBy: session.id,
    },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      assignees: {
        select: {
          userId: true,
          user: { select: { id: true, name: true, image: true } },
        },
      },
      project: { select: { id: true, name: true } },
    },
  })

  return interaction
})
