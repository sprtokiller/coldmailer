import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { sendGmailMessage, refreshAccessToken } from '~/server/utils/google'
import { scheduleOutreachSend } from '~/server/utils/outreach-scheduler'
import { upsertOutreachEntry, markOutreachSent, markOutreachError } from '~/server/utils/outreach-save'

const GRACE_PERIOD_MS = 20_000

interface ScheduleBody {
  partnerName: string
  partnerId?: string
  to: string
  subject: string
  body: string
  signatureContent?: string
  config?: {
    systemPromptId?: string
    contextPartIds?: string[]
    emailDraftId?: string
    signatureId?: string
    selectedArgumentIds?: string[]
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const runId = getRouterParam(event, 'id')!
  const body = await readBody<ScheduleBody>(event)

  if (!body.to || !body.subject || !body.body || !body.partnerName) {
    throw createError({ statusCode: 400, statusMessage: 'partnerName, to, subject a body jsou povinné.' })
  }

  const { stepId } = await upsertOutreachEntry(runId, user.id, user.name, body.partnerName, {
    partnerId: body.partnerId,
    to: body.to,
    subject: body.subject,
    body: body.body,
    savedConfig: body.config,
  })

  const scheduledId = `${runId}:${body.partnerName}`
  const SIGNATURE_SEPARATOR = '<br><br><hr><br>'

  scheduleOutreachSend(scheduledId, runId, user.id, GRACE_PERIOD_MS, async () => {
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

    const fullBody = body.signatureContent
      ? body.body + SIGNATURE_SEPARATOR + body.signatureContent
      : body.body

    let result: { id: string; threadId: string }
    try {
      result = await sendGmailMessage(accessToken, body.to, body.subject, fullBody)
    } catch (err) {
      await markOutreachError(stepId, body.partnerName, err instanceof Error ? err.message : String(err))
      throw err
    }

    const run = await prisma.pipelineRun.findUnique({ where: { id: runId }, select: { projectId: true } })
    if (run && body.partnerId) {
      // Ensure the 'to' address is a known contact for this partner
      const normalizedTo = body.to.toLowerCase()
      const existingContact = await prisma.partnerContact.findFirst({
        where: { globalRecordId: body.partnerId, address: normalizedTo }
      })
      
      if (!existingContact) {
        await prisma.partnerContact.create({
          data: {
            globalRecordId: body.partnerId,
            address: normalizedTo,
            label: 'Added from manual send'
          }
        }).catch(err => console.error(`[outreach] failed to add contact ${normalizedTo}:`, err))
      }

      await prisma.interaction.create({
        data: {
          globalRecordId: body.partnerId,
          projectId: run.projectId,
          type: 'EMAIL',
          direction: 'SENT',
          subject: body.subject,
          sentAt: new Date(),
          fromAddress: dbUser.email,
          toAddress: body.to,
          gmailId: result.id,
          content: fullBody,
          createdBy: user.id,
        },
      }).catch((err) => {
        console.error(`[outreach] failed to create interaction for partner ${body.partnerName}:`, err)
      })
    }

    await markOutreachSent(stepId, body.partnerName, {
      sentAt: new Date().toISOString(),
      sentBy: { id: user.id, name: dbUser.name },
      gmailMessageId: result.id,
    })

    console.log(`[outreach-scheduler] sent email to ${body.to} for partner ${body.partnerName}`)
  })

  return { scheduledId, gracePeriodMs: GRACE_PERIOD_MS }
})
