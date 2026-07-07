import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveScope } from '~/server/utils/activeProject'
import { getInteractionAccess, canEditNegotiation } from '~/server/utils/projectPermissions'

const PERSON_SELECT = { id: true, name: true, image: true } as const

const EMAIL_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  creator: { select: PERSON_SELECT },
  assignees: { select: { userId: true, user: { select: PERSON_SELECT } } },
  direction: true,
  subject: true,
  sentAt: true,
  fromAddress: true,
  toAddress: true,
  ccAddress: true,
  bccAddress: true,
  gmailId: true,
  threadId: true,
  content: true,
  isUnknownContact: true,
  unknownContactAddress: true,
  isRead: true,
} as const

const NOTE_SELECT = {
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  creator: { select: PERSON_SELECT },
  assignees: { select: { userId: true, user: { select: PERSON_SELECT } } },
  content: true,
} as const

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const scope = await getActiveScope(event)
  const projectId = scope.project?.id

  if (!projectId) {
    return {
      items: [],
      fulfillment: { myToThem: null, themToUs: null },
      crossProjectSummary: [],
      access: { canViewAll: false, canEditAll: false, canEdit: false, canManageAssignees: false },
    }
  }

  const access = await getInteractionAccess(session.id, projectId)
  const effectiveCanEdit = access.canEditAll || access.isAdmin || await canEditNegotiation(session.id, projectId, globalRecordId)
  const canViewFull = access.canViewAll || access.isAdmin || effectiveCanEdit

  const negotiation = await prisma.negotiation.findUnique({
    where: { projectId_globalRecordId: { projectId, globalRecordId } },
    select: {
      myToThem: true,
      themToUs: true,
      emails: { select: EMAIL_SELECT },
      notes: { select: NOTE_SELECT },
    },
  })

  const emailItems = (negotiation?.emails ?? []).map(e => ({
    ...e,
    type: 'EMAIL' as const,
    effectiveDate: e.sentAt ?? e.createdAt,
  }))
  const noteItems = (negotiation?.notes ?? []).map(n => ({
    ...n,
    type: 'NOTE' as const,
    effectiveDate: n.createdAt,
  }))

  let items: any[] = [...emailItems, ...noteItems].sort(
    (a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime(),
  )

  if (!canViewFull) {
    items = items.map((i) => {
      if (i.type === 'EMAIL') {
        return { ...i, content: null, fromAddress: null, toAddress: null, ccAddress: null, bccAddress: null, gmailId: null }
      }
      return { ...i, content: null }
    })
  }
  items = items.map(i => ({ ...i, canEdit: canViewFull ? effectiveCanEdit : false }))

  const fulfillment = canViewFull
    ? { myToThem: negotiation?.myToThem ?? null, themToUs: negotiation?.themToUs ?? null }
    : { myToThem: null, themToUs: null }

  // Cross-visibility: metadata from other projects where user is assignee on
  // at least one email/note/fulfillment for this same partner.
  const [otherEmails, otherNotes, otherFulfillments] = await Promise.all([
    prisma.email.findMany({
      where: { negotiation: { globalRecordId, projectId: { not: projectId } }, assignees: { some: {} } },
      select: {
        updatedAt: true,
        assignees: { select: { userId: true, user: { select: { name: true } } } },
        negotiation: { select: { projectId: true, project: { select: { id: true, name: true } } } },
      },
    }),
    prisma.note.findMany({
      where: { negotiation: { globalRecordId, projectId: { not: projectId } }, assignees: { some: {} } },
      select: {
        updatedAt: true,
        assignees: { select: { userId: true, user: { select: { name: true } } } },
        negotiation: { select: { projectId: true, project: { select: { id: true, name: true } } } },
      },
    }),
    prisma.negotiation.findMany({
      where: { globalRecordId, projectId: { not: projectId }, fulfillmentAssignees: { some: {} } },
      select: {
        projectId: true,
        project: { select: { id: true, name: true } },
        fulfillmentAssignees: { select: { userId: true, user: { select: { name: true } } } },
      },
    }),
  ])

  const userIsAssigneeAnywhere =
    (await prisma.emailAssignee.count({ where: { userId: session.id, email: { negotiation: { globalRecordId } } } })) +
    (await prisma.noteAssignee.count({ where: { userId: session.id, note: { negotiation: { globalRecordId } } } })) +
    (await prisma.fulfillmentAssignee.count({ where: { userId: session.id, negotiation: { globalRecordId } } }))

  let crossProjectSummary: any[] = []
  if (access.isAdmin || userIsAssigneeAnywhere > 0) {
    const byProject = new Map<string, {
      projectId: string
      projectName: string
      interactionCount: number
      lastActivityAt: Date | null
      assigneeNames: Set<string>
    }>()

    const touch = (
      pId: string,
      pName: string,
      updatedAt: Date | null,
      assignees: { user: { name: string } }[],
    ) => {
      let entry = byProject.get(pId)
      if (!entry) {
        entry = { projectId: pId, projectName: pName, interactionCount: 0, lastActivityAt: null, assigneeNames: new Set() }
        byProject.set(pId, entry)
      }
      entry.interactionCount++
      if (updatedAt && (!entry.lastActivityAt || updatedAt > entry.lastActivityAt)) entry.lastActivityAt = updatedAt
      for (const a of assignees) entry.assigneeNames.add(a.user.name)
    }

    for (const e of otherEmails) touch(e.negotiation.projectId, e.negotiation.project.name, e.updatedAt, e.assignees)
    for (const n of otherNotes) touch(n.negotiation.projectId, n.negotiation.project.name, n.updatedAt, n.assignees)
    for (const f of otherFulfillments) touch(f.projectId, f.project.name, null, f.fulfillmentAssignees)

    crossProjectSummary = [...byProject.values()].map(e => ({ ...e, assigneeNames: [...e.assigneeNames] }))
  }

  return {
    items,
    fulfillment,
    crossProjectSummary,
    access: {
      canViewAll: access.canViewAll || access.isAdmin,
      canEditAll: access.canEditAll || access.isAdmin,
      canEdit: effectiveCanEdit,
      canManageAssignees: access.canEditAll || access.isAdmin,
    },
  }
})
