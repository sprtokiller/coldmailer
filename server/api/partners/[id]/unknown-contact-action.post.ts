import { prisma } from '~/server/utils/prisma'
import { requireAuth } from '~/server/utils/requireAuth'
import { getActiveProjectId } from '~/server/utils/activeProject'
import { startTrackedPartnerEmailSyncs } from '~/server/utils/gmail-sync'
import { removeProjectAdditionalAddress } from '~/server/utils/project-additional-addresses'

export default defineEventHandler(async (event) => {
  const session = await requireAuth(event)
  const globalRecordId = getRouterParam(event, 'id')!
  const projectId = await getActiveProjectId(event)
  const body = await readBody<{
    action: 'dismiss' | 'blacklist' | 'add_contact'
    email: string
    firstName?: string
    lastName?: string
    role?: string
    contactType?: string
  }>(event)

  if (!body.email || !body.action) {
    throw createError({ statusCode: 400, message: 'email and action are required' })
  }

  const email = body.email.trim().toLowerCase()

  if (body.action === 'dismiss') {
    await prisma.interaction.deleteMany({
      where: {
        globalRecordId,
        isUnknownContact: true,
        unknownContactAddress: email,
      },
    })
    if (projectId) {
      await removeProjectAdditionalAddress(projectId, globalRecordId, email)
    }
    return { ok: true }
  }

  if (body.action === 'blacklist') {
    await prisma.interaction.deleteMany({
      where: {
        globalRecordId,
        isUnknownContact: true,
        unknownContactAddress: email,
      },
    })

    if (projectId) {
      await removeProjectAdditionalAddress(projectId, globalRecordId, email)

      const projRecord = await prisma.projectRecord.findUnique({
        where: { projectId_globalRecordId: { globalRecordId, projectId } },
        select: { contactBlacklist: true },
      })

      const existing = Array.isArray(projRecord?.contactBlacklist)
        ? (projRecord.contactBlacklist as string[])
        : []

      if (!existing.includes(email)) {
        await prisma.projectRecord.upsert({
          where: { projectId_globalRecordId: { globalRecordId, projectId } },
          create: { globalRecordId, projectId, contactBlacklist: [...existing, email] },
          update: { contactBlacklist: [...existing, email] },
        })
      }
    }

    return { ok: true }
  }

  if (body.action === 'add_contact') {
    await prisma.partnerContact.upsert({
      where: { globalRecordId_address: { globalRecordId, address: email } },
      create: {
        globalRecordId,
        address: email,
        firstName: body.firstName || null,
        lastName: body.lastName || null,
        role: body.role || null,
        contactType: body.contactType || null,
      },
      update: {
        firstName: body.firstName || undefined,
        lastName: body.lastName || undefined,
        role: body.role || undefined,
        contactType: body.contactType || undefined,
      },
    })

    if (projectId) {
      await removeProjectAdditionalAddress(projectId, globalRecordId, email)
    }

    await prisma.interaction.updateMany({
      where: {
        globalRecordId,
        isUnknownContact: true,
        unknownContactAddress: email,
      },
      data: {
        isUnknownContact: false,
        unknownContactAddress: null,
      },
    })

    startTrackedPartnerEmailSyncs(session.id, globalRecordId, [email])

    return { ok: true }
  }

  throw createError({ statusCode: 400, message: 'Invalid action' })
})
