/**
 * POST /api/projects/[projectId]/outreach/[globalRecordId]/send
 *
 * Bez `scheduledFor`: odešle e-mail přes Gmail hned, s grace period pro undo.
 * Vrací { scheduled: false, scheduledId, gracePeriodMs }.
 *
 * S `scheduledFor` (budoucí ISO datetime): vytvoří ScheduledEmail místo
 * okamžitého odeslání — stejný mechanismus jako /negotiations.
 * Vrací { scheduled: true, scheduledEmail }.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'
import { getProjectPermissions } from '~/server/utils/projectPermissions'
import { sendGmailMessage, refreshAccessToken } from '~/server/utils/google'
import { scheduleOutreachSend } from '~/server/utils/outreach-scheduler'
import { trackCustomRecipientAddress } from '~/server/utils/project-additional-addresses'
import { assignNegotiationOnSend } from '~/server/utils/negotiation-assignment'

const GRACE_PERIOD_MS = 20_000
const SIGNATURE_SEPARATOR = '<br><br><hr><br>'

interface SendBody {
  toAddress: string
  subject: string
  body: string
  signatureContent?: string
  scheduledFor?: string // ISO datetime — if set and in the future, schedules instead of sending now
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  const globalRecordId = getRouterParam(event, 'globalRecordId')!
  const body = await readBody<SendBody>(event)

  await requireProjectAccess(event, projectId)

  if (!body.toAddress || !body.subject || !body.body) {
    throw createError({ statusCode: 400, message: 'toAddress, subject a body jsou povinné.' })
  }

  // If the draft was prepared by a different user, require pipeline.manage permission
  const existingDraft = await prisma.partnerOutreachDraft.findUnique({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    select: { savedById: true },
  })
  if (existingDraft && existingDraft.savedById !== user.id) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { isAdmin: true } })
    if (!dbUser?.isAdmin) {
      const perms = await getProjectPermissions(user.id, projectId)
      if (!perms.includes('project.pipeline.manage')) {
        throw createError({ statusCode: 403, message: 'Nemáte oprávnění odeslat e-mail připravený jiným uživatelem.' })
      }
    }
  }

  // Save draft before sending; preserve savedById/savedAt of original author
  await prisma.partnerOutreachDraft.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, toAddress: body.toAddress, subject: body.subject, body: body.body, savedById: user.id },
    update: { toAddress: body.toAddress, subject: body.subject, body: body.body },
  })

  if (body.scheduledFor) {
    const scheduledFor = new Date(body.scheduledFor)
    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() <= Date.now()) {
      throw createError({ statusCode: 400, message: 'Naplánovaný čas musí být v budoucnosti.' })
    }

    const fullBody = body.signatureContent ? body.body + SIGNATURE_SEPARATOR + body.signatureContent : body.body

    const scheduledEmail = await prisma.scheduledEmail.create({
      data: {
        projectId,
        globalRecordId,
        toAddress: body.toAddress,
        subject: body.subject,
        body: fullBody,
        scheduledFor,
        createdById: user.id,
      },
      include: { createdBy: { select: { id: true, name: true, image: true } } },
    })

    return { scheduled: true as const, scheduledEmail }
  }

  const scheduledId = `project:${projectId}:${globalRecordId}`

  scheduleOutreachSend(scheduledId, projectId, user.id, GRACE_PERIOD_MS, async () => {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
    if (!dbUser?.accessToken) throw new Error('No Gmail access token')

    let accessToken = dbUser.accessToken
    if (dbUser.refreshToken && (!dbUser.tokenExpiry || dbUser.tokenExpiry < new Date())) {
      const config = useRuntimeConfig()
      const refreshed = await refreshAccessToken(dbUser.refreshToken, config.googleClientId, config.googleClientSecret)
      accessToken = refreshed.access_token
      await prisma.user.update({
        where: { id: user.id },
        data: { accessToken: refreshed.access_token, tokenExpiry: new Date(Date.now() + refreshed.expires_in * 1000) },
      })
    }

    const fullBody = body.signatureContent ? body.body + SIGNATURE_SEPARATOR + body.signatureContent : body.body

    let result: { id: string; threadId: string }
    try {
      result = await sendGmailMessage(accessToken, body.toAddress, body.subject, fullBody)
    } catch (err) {
      await prisma.partnerOutreachDraft.update({
        where: { projectId_globalRecordId: { projectId, globalRecordId } },
        data: { sendError: err instanceof Error ? err.message : String(err) },
      }).catch(() => {})
      throw err
    }

    // If the recipient is not a known global contact, track it as a project-level additional address
    await trackCustomRecipientAddress(projectId, globalRecordId, body.toAddress)

    // Negotiation must exist before creating the Email row (Email.negotiationId is a FK)
    const negotiation = await assignNegotiationOnSend(projectId, globalRecordId, user.id)

    await prisma.email.create({
      data: {
        negotiationId: negotiation.id,
        direction: 'SENT',
        subject: body.subject,
        sentAt: new Date(),
        fromAddress: dbUser.email,
        toAddress: body.toAddress,
        gmailId: result.id,
        content: fullBody,
        createdBy: user.id,
        isRead: true,
      },
    }).catch(err => console.error(`[outreach] failed to create email:`, err))

    // Mark as sent
    await prisma.partnerOutreachDraft.update({
      where: { projectId_globalRecordId: { projectId, globalRecordId } },
      data: { sentAt: new Date(), sentById: user.id, gmailId: result.id, sendError: null },
    }).catch(() => {})

    console.log(`[outreach-send] sent to ${body.toAddress} for globalRecord ${globalRecordId}`)
  })

  return { scheduled: false as const, scheduledId, gracePeriodMs: GRACE_PERIOD_MS }
})
