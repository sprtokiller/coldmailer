import { requireAuth } from '~/server/utils/requireAuth'
import { requirePermission } from '~/server/utils/permissions'
import { getDefaultBudgetConfig, setDefaultBudgetConfig } from '~/server/utils/usage-tracker'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requirePermission(event, 'admin.roles')

  const method = getMethod(event)

  if (method === 'GET') {
    return getDefaultBudgetConfig()
  }

  // PATCH / POST
  const body = await readBody<{ limitUsd?: number | null; resetPeriod?: string }>(event)
  await setDefaultBudgetConfig(
    {
      limitUsd:    body.limitUsd    ?? null,
      resetPeriod: (body.resetPeriod as 'never' | 'daily' | 'weekly' | 'monthly') ?? 'never',
    },
    user.id,
  )
  return getDefaultBudgetConfig()
})
