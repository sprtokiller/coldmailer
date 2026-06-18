import { requirePipelineAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  const match = event.path.match(/^\/api\/pipeline\/([^/?]+)/)
  if (!match) return

  await requirePipelineAccess(event, decodeURIComponent(match[1]))
})
