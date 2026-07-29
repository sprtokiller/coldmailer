/**
 * POST /api/partners/[id]/reminder-draft
 *
 * Vygeneruje (jednorázově, bez streamu) návrh připomínkového e-mailu pro partnera,
 * který dosud neodpověděl. AI dostane předchozí odeslaný e-mail, informace o partnerovi
 * a jeho kontakty; vrátí příjemce, tělo připomínky a poznámky pro odesílatele.
 * Text se pak předvyplní do dialogu nového e-mailu jako odpověď do stejného vlákna.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { canEditNegotiation } from '~/server/utils/projectPermissions'
import { streamStepAI } from '~/server/utils/ai'
import { trackAIUsage, isOverBudget } from '~/server/utils/usage-tracker'
import { parseAIOutput } from '~/server/utils/parse-ai-output'
import { libraryScopeForProject } from '~/server/utils/libraryScope'
import { STEP_OUTPUT_SCHEMAS, GROUP_FONTS, formatSchemaForPrompt, getMissingPlaceholders, renderPromptTemplate, MODELS } from '~/config/pipeline'

interface ReminderBody {
  systemPromptId?: string
  emailDraftId?: string
}

const STEP = 'REMINDER_PREPARATION'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const body = await readBody<ReminderBody>(event)

  const scope = await getActiveScope(event)
  const project = scope.project
  if (!project) throw createError({ statusCode: 400, message: 'Není vybrán žádný projekt.' })
  const projectId = project.id

  const canEdit = await canEditNegotiation(user.id, projectId, globalRecordId)
  if (!canEdit) {
    throw createError({ statusCode: 403, message: 'Nemáte oprávnění odeslat e-mail. Nejste přiřazeni k tomuto partnerovi.' })
  }

  const { over, limitUsd } = await isOverBudget(user.id)
  if (over) throw createError({ statusCode: 402, message: `Překročen budget limit ($${limitUsd!.toFixed(2)} USD)` })

  const scopeFilter = libraryScopeForProject(project)

  const [globalRecord, previousEmail, customPrompt, dbSystemPrompt, emailDraft] = await Promise.all([
    prisma.globalRecord.findUnique({
      where: { id: globalRecordId },
      include: {
        contacts: {
          where: { address: { contains: '@' } },
          orderBy: { priority: 'asc' },
          select: { address: true, label: true, firstName: true, lastName: true, role: true, contactType: true },
        },
      },
    }),
    prisma.email.findFirst({
      where: { negotiation: { projectId, globalRecordId }, direction: 'SENT' },
      orderBy: { sentAt: 'desc' },
      select: { subject: true, content: true, gmailId: true, toAddress: true, sentAt: true, fromAddress: true },
    }),
    body.systemPromptId
      ? prisma.systemPrompt.findFirst({ where: { id: body.systemPromptId, stepType: STEP as never, OR: [{ isSystem: true }, scopeFilter] } })
      : Promise.resolve(null),
    prisma.systemPrompt.findFirst({ where: { stepType: STEP as never, isSystem: true }, orderBy: { createdAt: 'desc' } }),
    body.emailDraftId
      ? prisma.emailDraft.findFirst({ where: { id: body.emailDraftId, ...scopeFilter } })
      : Promise.resolve(null),
  ])

  if (!globalRecord) throw createError({ statusCode: 404, message: 'Partner nenalezen.' })
  if (!previousEmail?.gmailId) {
    throw createError({ statusCode: 400, message: 'Pro tohoto partnera neexistuje odeslaný e-mail, na který by šlo navázat.' })
  }

  const rawPromptText = customPrompt?.content ?? dbSystemPrompt?.content
  if (!rawPromptText) {
    throw createError({ statusCode: 500, message: `Chybí systémový prompt pro krok ${STEP} (databáze není nasazená, spusťte "bun run db:seed").` })
  }
  const missingPlaceholders = getMissingPlaceholders(STEP, rawPromptText)
  if (missingPlaceholders.length) {
    throw createError({ statusCode: 500, message: `Systémový prompt pro krok ${STEP} postrádá povinné placeholdery: ${missingPlaceholders.join(', ')}.` })
  }
  const outputSchema = (customPrompt?.outputSchema as object | null) ?? (dbSystemPrompt?.outputSchema as object | null) ?? STEP_OUTPUT_SCHEMAS[STEP] ?? null

  const previousBlock = [
    `Předmět: ${previousEmail.subject ?? '(bez předmětu)'}`,
    previousEmail.sentAt ? `Odesláno: ${new Date(previousEmail.sentAt).toLocaleString('cs-CZ')}` : null,
    previousEmail.toAddress ? `Adresát: ${previousEmail.toAddress}` : null,
    `Tělo:\n${previousEmail.content ?? '(prázdné)'}`,
  ].filter(Boolean).join('\n')

  const partnerBlock = [
    `Název: ${globalRecord.canonicalName}`,
    `Data:\n${JSON.stringify(globalRecord.payload, null, 2)}`,
  ].join('\n')

  const contactsBlock = globalRecord.contacts.length
    ? globalRecord.contacts
        .map(c => `- ${c.address}${[c.firstName, c.lastName].filter(Boolean).length ? ` (${[c.firstName, c.lastName].filter(Boolean).join(' ')})` : ''}${c.role ? ` – ${c.role}` : ''}${c.contactType ? ` [${c.contactType}]` : ''}`)
        .join('\n')
    : '(žádné uložené kontakty)'

  const templateSection = emailDraft
    ? ['Šablona připomínky (respektuj tón, styl a délku):', `Předmět: ${emailDraft.subject}`, `Tělo:\n${emailDraft.body}`].join('\n')
    : '(žádná šablona — napiš krátkou zdvořilou připomínku)'

  const systemPromptText = renderPromptTemplate(rawPromptText, {
    SCHEMA: outputSchema ? formatSchemaForPrompt(outputSchema) : undefined,
    PREVIOUS: previousBlock,
    PARTNER: partnerBlock,
    CONTACTS: contactsBlock,
    TEMPLATE: templateSection,
    USER: user.name ?? '',
  })

  const fontFamily = GROUP_FONTS[project.group?.slug ?? ''] ?? ''
  const userMsg = [
    'Napiš krátkou připomínku dle systémového promptu.',
    fontFamily ? `Font pro HTML formátování: ${fontFamily}` : null,
    previousEmail.toAddress ? `Předchozí adresát: ${previousEmail.toAddress}` : null,
  ].filter(Boolean).join('\n')

  let output = ''
  const { stream, getCost } = streamStepAI({ stepType: STEP, systemPrompt: systemPromptText, userMessage: userMsg })
  for await (const chunk of stream) output += chunk

  try {
    const costUsd = await getCost()
    await trackAIUsage({ userId: user.id, model: MODELS.CLAUDE_SONNET, costUsd, stepType: STEP })
  } catch { /* non-fatal */ }

  const parsed = parseAIOutput(output)
  const data = (typeof parsed.data === 'object' && parsed.data !== null && !Array.isArray(parsed.data))
    ? parsed.data as Record<string, unknown>
    : {}

  const recipients = Array.isArray(data.recipients)
    ? data.recipients.map(String).map(s => s.trim()).filter(Boolean)
    : []
  // Vždy zaručit alespoň původního adresáta jako prvního příjemce.
  const primary = (previousEmail.toAddress ?? '').trim()
  if (primary && !recipients.some(r => r.toLowerCase() === primary.toLowerCase())) recipients.unshift(primary)

  const reminderBody = String(data.body ?? output)
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations.map(String) : []

  return {
    recipients,
    body: reminderBody,
    recommendations,
    previousEmail: {
      gmailId: previousEmail.gmailId,
      subject: previousEmail.subject ?? '',
      content: previousEmail.content ?? '',
      sentAt: previousEmail.sentAt,
      fromAddress: previousEmail.fromAddress ?? '',
    },
  }
})
