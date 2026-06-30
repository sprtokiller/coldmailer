import { requireAuth } from '~/server/utils/requireAuth'

interface OpenRouterCreditsResponse {
  data: {
    total_credits: number
    total_usage: number
  }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig(event)
  const managementKey = config.openRouterManagementKey

  if (!managementKey) {
    throw createError({ statusCode: 503, message: 'OPEN_ROUTER_MANAGEMENT_KEY nenĂ­ nastaven' })
  }

  const res = await fetch('https://openrouter.ai/api/v1/credits', {
    headers: {
      Authorization: `Bearer ${managementKey}`,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw createError({ statusCode: res.status, message: `OpenRouter API error: ${text}` })
  }

  const json = await res.json() as OpenRouterCreditsResponse
  const { total_credits, total_usage } = json.data

  return {
    totalCredits: total_credits,
    usedCredits: total_usage,
    remainingCredits: total_credits - total_usage,
  }
})

