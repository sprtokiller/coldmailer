import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess, canEditNegotiation } from '~/server/utils/projectPermissions'

const META_SELECT = {
  id: true,
  type: true,
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
  ccAddress: true,
  gmailId: true,
  myToThem: true,
  themToUs: true,
  isUnknownContact: true,
  unknownContactAddress: true,
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
  const effectiveCanEdit = access.canEditAll || access.isAdmin || await canEditNegotiation(session.id, projectId, globalRecordId)

  let items
  if (access.canViewAll || access.isAdmin) {
    items = await prisma.interaction.findMany({
      where: { globalRecordId, projectId },
      select: FULL_SELECT,
      orderBy: [{ sentAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    })
    items = items.map(i => ({ ...i, canEdit: effectiveCanEdit }))
  } else {
    const all = await prisma.interaction.findMany({
      where: { globalRecordId, projectId },
      select: FULL_SELECT,
      orderBy: [{ sentAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    })
    items = all.map((i) => {
      if (effectiveCanEdit) return { ...i, canEdit: true }
      return {
        id: i.id,
        type: i.type,
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
        ccAddress: null,
        gmailId: null,
        myToThem: null,
        themToUs: null,
        globalRecordId: i.globalRecordId,
        isUnknownContact: i.isUnknownContact,
        unknownContactAddress: i.unknownContactAddress,
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
          assigneeNames: new Set(),
        }
        byProject.set(i.projectId, entry)
      }
      entry.interactionCount++
      if (!entry.lastActivityAt || i.updatedAt > entry.lastActivityAt) {
        entry.lastActivityAt = i.updatedAt
      }
      for (const a of i.assignees) entry.assigneeNames.add(a.user.name)
    }

    crossProjectSummary = [...byProject.values()].map(e => ({
      ...e,
      assigneeNames: [...e.assigneeNames],
    }))
  }

  return {
    items,
    crossProjectSummary,
    access: {
      canViewAll: access.canViewAll || access.isAdmin,
      canEditAll: access.canEditAll || access.isAdmin,
      canEdit: effectiveCanEdit,
      canManageAssignees: access.canEditAll || access.isAdmin,
    },
  }
})
