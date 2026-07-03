/**
 * POST /api/projects/[projectId]/outreach/[globalRecordId]/send
 *
 * Naplánuje odeslání e-mailu přes Gmail s grace period.
 * Vrací { scheduledId, gracePeriodMs }.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'
import { getProjectPermissions } from '~/server/utils/projectPermissions'
import { sendGmailMessage, refreshAccessToken } from '~/server/utils/google'
import { scheduleOutreachSend } from '~/server/utils/outreach-scheduler'
import { trackCustomRecipientAddress } from '~/server/utils/project-additional-addresses'

const GRACE_PERIOD_MS = 20_000
const SIGNATURE_SEPARATOR = '<br><br><hr><br>'

interface SendBody {
  toAddress: string
  subject: string
  body: string
  signatureContent?: string
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

    // Sending on behalf of a colleague — assign both users so Gmail sync scans both mailboxes for this partner
    await prisma.outreachAssignment.upsert({
      where: { projectId_globalRecordId_assigneeId: { projectId, globalRecordId, assigneeId: user.id } },
      create: { projectId, globalRecordId, assigneeId: user.id, assignedById: user.id },
      update: {},
    })
    await prisma.outreachAssignment.upsert({
      where: { projectId_globalRecordId_assigneeId: { projectId, globalRecordId, assigneeId: existingDraft.savedById } },
      create: { projectId, globalRecordId, assigneeId: existingDraft.savedById, assignedById: user.id },
      update: {},
    })
  }

  // Save draft before sending; preserve savedById/savedAt of original author
  await prisma.partnerOutreachDraft.upsert({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    create: { projectId, globalRecordId, toAddress: body.toAddress, subject: body.subject, body: body.body, savedById: user.id },
    update: { toAddress: body.toAddress, subject: body.subject, body: body.body },
  })

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

    // Create Interaction record
    await prisma.interaction.create({
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
        createdBy: user.id,
      },
    }).catch(err => console.error(`[outreach] failed to create interaction:`, err))

    // Mark as sent
    await prisma.partnerOutreachDraft.update({
      where: { projectId_globalRecordId: { projectId, globalRecordId } },
      data: { sentAt: new Date(), sentById: user.id, gmailId: result.id, sendError: null },
    }).catch(() => {})

    console.log(`[outreach-send] sent to ${body.toAddress} for globalRecord ${globalRecordId}`)
  })

  return { scheduledId, gracePeriodMs: GRACE_PERIOD_MS }
})
