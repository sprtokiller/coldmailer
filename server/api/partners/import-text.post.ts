import OpenAI from 'openai'
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { parseAIOutput } from '~/server/utils/parse-ai-output'
import { OPENROUTER, MODELS } from '~/config/pipeline'
import { normalizeName } from '~/server/utils/deduplication'
import { logEvent } from '~/server/utils/record-events'
import { syncGmailForPartnerEmail, getEmailSyncHistoryDays } from '~/server/utils/gmail-sync'

const RESERVED_PARTNER_KEYS = ['canonicalName', 'name'] as const

function extractPartner(obj: Record<string, unknown>): { canonicalName: string; payload: Record<string, unknown> } {
  const canonicalName = String(obj.canonicalName ?? obj.name ?? '').trim()
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if ((RESERVED_PARTNER_KEYS as readonly string[]).includes(key)) continue
    if (value !== undefined && value !== null && value !== '') payload[key] = value
  }
  return { canonicalName, payload }
}

async function createPartnerRecord(canonicalName: string, payload: Record<string, unknown>, userId: string) {
  const normalized = normalizeName(canonicalName)
  const existing = await prisma.globalRecord.findUnique({
    where: { normalizedName_type: { normalizedName: normalized, type: 'PARTNER' } },
  })
  if (existing) {
    throw createError({
      statusCode: 409,
      message: `Partner "${existing.canonicalName}" již existuje.`,
      data: { existingId: existing.id },
    })
  }

  const record = await prisma.globalRecord.create({
    data: {
      type: 'PARTNER',
      canonicalName,
      normalizedName: normalized,
      payload: payload as never,
      createdBy: userId,
    },
  })
  await logEvent({ globalRecordId: record.id, userId, eventType: 'MANUAL_CREATE' })

  const contacts = Array.isArray(payload.contacts) ? (payload.contacts as Record<string, unknown>[]) : []
  const emailContacts = contacts.filter((c) => (c.email as string)?.trim())
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i]
    const address = (c.email as string)?.trim() ? (c.email as string).trim().toLowerCase() : null
    try {
      await prisma.partnerContact.create({
        data: {
          globalRecordId: record.id,
          address,
          label: [c.firstName, c.lastName].filter(Boolean).join(' ') || null,
          firstName: (c.firstName as string) || null,
          lastName: (c.lastName as string) || null,
          role: (c.role as string) || null,
          contactType: (c.type as string) || null,
          priority: (c.priority as number) ?? 3,
          note: (c.note as string) || null,

        },
      })
    } catch (e: unknown) {
      if ((e as { code?: string })?.code !== 'P2002') throw e
    }
  }

  if (emailContacts.length > 0) {
    getEmailSyncHistoryDays().then((historyDays) => {
      for (const c of emailContacts) {
        syncGmailForPartnerEmail(userId, record.id, (c.email as string).trim(), historyDays)
          .catch(() => {})
      }
    })
  }

  return record
}

const AI_SYSTEM_PROMPT = `Jsi asistent pro extrakci informací o partnerech. Analyzuj text a vrať strukturovaný JSON objekt.

Vrať JEDEN JSON objekt uvnitř \`\`\`json bloku v tomto formátu:
\`\`\`json
{
  "canonicalName": "Přesný název firmy (povinné)",
  "website": "URL webu",
  "linkedinUrl": "LinkedIn URL",
  "industry": "Odvětví",
  "size": "micro|small|medium|large|enterprise",
  "summary": "Stručný popis firmy",
  "activities": "Aktivity a služby",
  "contacts": [{"firstName": "", "lastName": "", "role": "", "email": ""}]
}
\`\`\`

Pole bez informací vynech. Pokud v textu najdeš další relevantní informace, které se nevejdou do výše uvedených polí, přidej je jako vlastní pojmenovaná pole na stejné úrovni. Vrať POUZE \`\`\`json blok, žádný jiný text.`

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<{ rawText: string }>(event)

  if (!body.rawText?.trim()) {
    throw createError({ statusCode: 400, message: 'rawText je povinný' })
  }

  // Try JSON parse first — skips AI if input is already structured
  const { data: parsed } = parseAIOutput(body.rawText)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const { canonicalName, payload } = extractPartner(parsed as Record<string, unknown>)
    if (canonicalName) {
      const record = await createPartnerRecord(canonicalName, payload, user.id)
      return { record }
    }
  }

  // Call AI to convert free text to partner schema
  const runtimeConfig = useRuntimeConfig(event)
  const client = new OpenAI({
    baseURL: OPENROUTER.baseURL,
    apiKey: runtimeConfig.openRouterApiKey as string,
    defaultHeaders: { 'HTTP-Referer': OPENROUTER.siteUrl, 'X-Title': OPENROUTER.siteTitle },
  })

  const response = await client.chat.completions.create({
    model: MODELS.CLAUDE_HAIKU,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: `Extrahuj informace o partnerovi:\n---\n${body.rawText}\n---` },
    ],
  })

  const rawOutput = response.choices[0]?.message?.content ?? ''
  const { data: aiData, error: parseError } = parseAIOutput(rawOutput)

  if (!aiData || typeof aiData !== 'object' || Array.isArray(aiData)) {
    throw createError({ statusCode: 422, message: `AI vrátila neplatný JSON: ${parseError?.slice(0, 120)}` })
  }

  const { canonicalName, payload } = extractPartner(aiData as Record<string, unknown>)
  if (!canonicalName) {
    throw createError({ statusCode: 422, message: 'AI nedokázala extrahovat název partnera z textu.' })
  }

  const record = await createPartnerRecord(canonicalName, payload, user.id)
  return { record }
})
