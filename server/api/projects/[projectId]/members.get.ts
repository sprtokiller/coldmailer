/**
 * GET /api/projects/[projectId]/members
 *
 * Vrátí seznam uživatelů, kteří mají přiřazenou roli v projektu.
 * Používá se pro admin UI výběru přiřazení.
 */
import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { requireProjectAccess } from '~/server/utils/permissions'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const projectId = getRouterParam(event, 'projectId')!
  await requireProjectAccess(event, projectId)

  const roles = await prisma.projectRole.findMany({
    where: { projectId },
    include: {
      users: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      },
    },
  })

  const seen = new Set<string>()
  const members: { id: string; name: string; email: string; image: string | null }[] = []
  for (const role of roles) {
    for (const { user } of role.users) {
      if (!seen.has(user.id)) {
        seen.add(user.id)
        members.push(user)
      }
    }
  }

  return members.sort((a, b) => a.name.localeCompare(b.name))
})
