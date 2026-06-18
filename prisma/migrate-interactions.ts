import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_PROJECT_ROLES = [
  {
    name: 'Vedoucí obchodu',
    permissions: ['project.interactions.view_all', 'project.interactions.edit_all'],
    isSystem: true,
  },
  {
    name: 'Obchodní tým',
    permissions: ['project.interactions.view_all'],
    isSystem: true,
  },
]

async function resolveProjectId(groupId: string | null, userId: string): Promise<string | null> {
  if (groupId) {
    const project = await prisma.project.findFirst({ where: { groupId }, orderBy: { name: 'asc' } })
    if (project) return project.id
  }

  const userProject = await prisma.userProject.findFirst({
    where: { userId },
    orderBy: { assignedAt: 'desc' },
  })
  if (userProject) return userProject.projectId

  const fallback = await prisma.project.findFirst({ orderBy: { name: 'asc' } })
  return fallback?.id ?? null
}

async function migrateNotes() {
  console.log('\n--- Migrating PartnerNotes ---')
  const notes = await prisma.partnerNote.findMany()
  let migrated = 0
  let skipped = 0

  for (const note of notes) {
    const projectId = await resolveProjectId(note.groupId, note.authorId)
    if (!projectId) {
      console.warn(`  ! Skipped note ${note.id}: no project found`)
      skipped++
      continue
    }

    await prisma.interaction.create({
      data: {
        globalRecordId: note.globalRecordId,
        projectId,
        type: 'NOTE',
        content: note.content,
        createdBy: note.authorId,
        createdAt: note.createdAt,
      },
    })
    migrated++
  }

  console.log(`  Migrated: ${migrated}, Skipped: ${skipped}`)
}

async function migrateMailEvents() {
  console.log('\n--- Migrating PartnerMailEvents ---')
  const events = await prisma.partnerMailEvent.findMany()
  let migrated = 0
  let skipped = 0

  for (const ev of events) {
    const projectId = await resolveProjectId(null, ev.createdBy)
    if (!projectId) {
      console.warn(`  ! Skipped mail event ${ev.id}: no project found`)
      skipped++
      continue
    }

    await prisma.interaction.create({
      data: {
        globalRecordId: ev.globalRecordId,
        projectId,
        type: 'EMAIL',
        content: ev.body,
        direction: ev.direction,
        subject: ev.subject,
        sentAt: ev.sentAt,
        fromAddress: ev.fromAddress,
        toAddress: ev.toAddress,
        gmailId: ev.gmailId,
        createdBy: ev.createdBy,
        createdAt: ev.createdAt,
      },
    })
    migrated++
  }

  console.log(`  Migrated: ${migrated}, Skipped: ${skipped}`)
}

async function migrateFulfillments() {
  console.log('\n--- Migrating PartnerFulfillments ---')
  const fulfillments = await prisma.partnerFulfillment.findMany()
  let migrated = 0
  let skipped = 0

  for (const f of fulfillments) {
    const projectId = await resolveProjectId(f.groupId, '')
    if (!projectId) {
      // Try harder: find any project
      const any = await prisma.project.findFirst()
      if (!any) {
        console.warn(`  ! Skipped fulfillment ${f.id}: no project found`)
        skipped++
        continue
      }
    }

    const finalProjectId = projectId ?? (await prisma.project.findFirst())?.id
    if (!finalProjectId) {
      skipped++
      continue
    }

    // Find a user to attribute as creator (first user with access to this project)
    const userProject = await prisma.userProject.findFirst({ where: { projectId: finalProjectId } })
    const systemUser = await prisma.user.findFirst({ where: { googleId: 'system' } })
    const creatorId = userProject?.userId ?? systemUser?.id

    if (!creatorId) {
      console.warn(`  ! Skipped fulfillment ${f.id}: no user found`)
      skipped++
      continue
    }

    await prisma.interaction.create({
      data: {
        globalRecordId: f.globalRecordId,
        projectId: finalProjectId,
        type: 'FULFILLMENT',
        myToThem: f.myToThem,
        themToUs: f.themToUs,
        createdBy: creatorId,
      },
    })
    migrated++
  }

  console.log(`  Migrated: ${migrated}, Skipped: ${skipped}`)
}

async function migrateAssignments() {
  console.log('\n--- Migrating PartnerAssignments to InteractionAssignees ---')
  const assignments = await prisma.partnerAssignment.findMany()
  let created = 0
  let autoCreated = 0

  for (const a of assignments) {
    const interactions = await prisma.interaction.findMany({
      where: { globalRecordId: a.globalRecordId },
      select: { id: true },
    })

    if (interactions.length === 0) {
      // Create a placeholder NOTE interaction
      const projectId = await resolveProjectId(null, a.userId)
      if (!projectId) continue

      const interaction = await prisma.interaction.create({
        data: {
          globalRecordId: a.globalRecordId,
          projectId,
          type: 'NOTE',
          content: 'Automaticky vytvořeno při migraci přiřazení.',
          createdBy: a.userId,
        },
      })
      await prisma.interactionAssignee.create({
        data: { interactionId: interaction.id, userId: a.userId },
      })
      autoCreated++
      continue
    }

    for (const interaction of interactions) {
      try {
        await prisma.interactionAssignee.create({
          data: { interactionId: interaction.id, userId: a.userId },
        })
        created++
      } catch {
        // Duplicate — already exists
      }
    }
  }

  console.log(`  Assignee links created: ${created}, Auto-created interactions: ${autoCreated}`)
}

async function seedProjectRoles() {
  console.log('\n--- Seeding ProjectRoles ---')
  const projects = await prisma.project.findMany()

  for (const project of projects) {
    for (const role of DEFAULT_PROJECT_ROLES) {
      await prisma.projectRole.upsert({
        where: { projectId_name: { projectId: project.id, name: role.name } },
        create: { projectId: project.id, name: role.name, permissions: role.permissions, isSystem: role.isSystem },
        update: {},
      })
    }
    console.log(`  ✓ ProjectRoles for: ${project.name}`)
  }
}

async function verify() {
  console.log('\n--- Verification ---')
  const noteCount = await prisma.partnerNote.count()
  const mailCount = await prisma.partnerMailEvent.count()
  const fulfillmentCount = await prisma.partnerFulfillment.count()
  const assignmentCount = await prisma.partnerAssignment.count()

  const interactionNotes = await prisma.interaction.count({ where: { type: 'NOTE' } })
  const interactionEmails = await prisma.interaction.count({ where: { type: 'EMAIL' } })
  const interactionFulfillments = await prisma.interaction.count({ where: { type: 'FULFILLMENT' } })
  const assigneeCount = await prisma.interactionAssignee.count()
  const projectRoleCount = await prisma.projectRole.count()

  console.log(`  PartnerNote: ${noteCount} → Interaction(NOTE): ${interactionNotes}`)
  console.log(`  PartnerMailEvent: ${mailCount} → Interaction(EMAIL): ${interactionEmails}`)
  console.log(`  PartnerFulfillment: ${fulfillmentCount} → Interaction(FULFILLMENT): ${interactionFulfillments}`)
  console.log(`  PartnerAssignment: ${assignmentCount} → InteractionAssignee: ${assigneeCount}`)
  console.log(`  ProjectRole count: ${projectRoleCount}`)
}

async function main() {
  console.log('=== Interaction Migration Script ===')

  await migrateNotes()
  await migrateMailEvents()
  await migrateFulfillments()
  await migrateAssignments()
  await seedProjectRoles()
  await verify()

  console.log('\n=== Migration complete ===')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
