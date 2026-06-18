import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess } from '~/server/utils/projectPermissions'

const META_SELECT = {
  id: true,
  type: true,
  actionStatus: true,
  dealStage: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  projectId: true,
  project: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true, image: true } },
  assignees: {
    select: {
      userId: true,
      user: { select: { id: true, name: true, image: true } },
    },
  },
} as const

const FULL_SELECT = {
  ...META_SELECT,
  globalRecordId: true,
  content: true,
  direction: true,
  subject: true,
  sentAt: true,
  fromAddress: true,
  toAddress: true,
  gmailId: true,
  myToThem: true,
  themToUs: true,
} as const

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    return { items: [], crossProjectSummary: [], access: { canViewAll: false, canEditAll: false } }
  }

  const access = await getInteractionAccess(session.id, projectId)

  let items
  if (access.canViewAll || access.isAdmin) {
    items = await prisma.interaction.findMany({
      where: { globalRecordId, projectId },
      select: FULL_SELECT,
      orderBy: { createdAt: 'asc' },
    })
    items = items.map(i => ({ ...i, canEdit: access.canEditAll || access.isAdmin || i.assignees.some(a => a.userId === session.id) }))
  } else {
    const all = await prisma.interaction.findMany({
      where: { globalRecordId, projectId },
      select: FULL_SELECT,
      orderBy: { createdAt: 'asc' },
    })
    items = all.map((i) => {
      const isAssignee = i.assignees.some(a => a.userId === session.id)
      if (isAssignee) return { ...i, canEdit: true }
      return {
        id: i.id,
        type: i.type,
        actionStatus: i.actionStatus,
        dealStage: i.dealStage,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        createdBy: i.createdBy,
        projectId: i.projectId,
        project: i.project,
        creator: i.creator,
        assignees: i.assignees,
        content: null,
        direction: i.direction,
        subject: i.type === 'EMAIL' ? i.subject : null,
        sentAt: i.sentAt,
        fromAddress: null,
        toAddress: null,
        gmailId: null,
        myToThem: null,
        themToUs: null,
        globalRecordId: i.globalRecordId,
        canEdit: false,
      }
    })
  }

  // Cross-visibility: metadata from other projects where user is assignee on at least one interaction
  const otherProjectInteractions = await prisma.interaction.findMany({
    where: {
      globalRecordId,
      projectId: { not: projectId },
      assignees: { some: {} },
    },
    select: {
      projectId: true,
      project: { select: { id: true, name: true } },
      actionStatus: true,
      dealStage: true,
      updatedAt: true,
      assignees: {
        select: { userId: true, user: { select: { name: true } } },
      },
    },
  })

  // Check if user is assignee on any interaction with this partner in any project
  const userIsAssigneeAnywhere = await prisma.interactionAssignee.count({
    where: {
      userId: session.id,
      interaction: { globalRecordId },
    },
  })

  let crossProjectSummary: any[] = []
  if (access.isAdmin || userIsAssigneeAnywhere > 0) {
    const byProject = new Map<string, {
      projectId: string
      projectName: string
      interactionCount: number
      lastActivityAt: Date | null
      dealStages: Set<string>
      actionStatuses: Set<string>
      assigneeNames: Set<string>
    }>()

    for (const i of otherProjectInteractions) {
      let entry = byProject.get(i.projectId)
      if (!entry) {
        entry = {
          projectId: i.projectId,
          projectName: i.project.name,
          interactionCount: 0,
          lastActivityAt: null,
          dealStages: new Set(),
          actionStatuses: new Set(),
          assigneeNames: new Set(),
        }
        byProject.set(i.projectId, entry)
      }
      entry.interactionCount++
      if (!entry.lastActivityAt || i.updatedAt > entry.lastActivityAt) {
        entry.lastActivityAt = i.updatedAt
      }
      if (i.dealStage) entry.dealStages.add(i.dealStage)
      if (i.actionStatus) entry.actionStatuses.add(i.actionStatus)
      for (const a of i.assignees) entry.assigneeNames.add(a.user.name)
    }

    crossProjectSummary = [...byProject.values()].map(e => ({
      ...e,
      dealStages: [...e.dealStages],
      actionStatuses: [...e.actionStatuses],
      assigneeNames: [...e.assigneeNames],
    }))
  }

  return {
    items,
    crossProjectSummary,
    access: { canViewAll: access.canViewAll || access.isAdmin, canEditAll: access.canEditAll || access.isAdmin },
  }
})
