import { requireAuth } from '~/server/utils/requireAuth'
import { upsertOutreachEntry } from '~/server/utils/outreach-save'

interface SaveBody {
  partnerName: string
  partnerId?: string
  to: string
  subject: string
  body: string
  config: {
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
  const body = await readBody<SaveBody>(event)

  if (!body.partnerName) {
    throw createError({ statusCode: 400, message: 'partnerName je povinný.' })
  }

  const { entry } = await upsertOutreachEntry(runId, user.id, user.name, body.partnerName, {
    partnerId: body.partnerId,
    to: body.to,
    subject: body.subject,
    body: body.body,
    savedConfig: body.config,
  })

  return entry
})
