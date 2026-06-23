import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const projectId = 'project-tda27'
  const partnerEmail = 'sprtokiller.6c@gmail.com'
  const userEmail = 'kriz@scg.cz'

  const user = await prisma.user.findUnique({ where: { email: userEmail } })
  if (!user) throw new Error('User not found')

  const partner = await prisma.globalRecord.findFirst({
    where: { contacts: { some: { address: partnerEmail } } }
  })
  if (!partner) throw new Error('Partner not found')

  const run = await prisma.pipelineRun.findFirst({
    where: { projectId },
    include: { steps: { orderBy: { createdAt: 'asc' } } }
  })
  if (!run || run.steps.length === 0) throw new Error('No run or steps found')

  const step = run.steps[0]

  // Upsert PipelineRecordRef
  const existingRef = await prisma.pipelineRecordRef.findFirst({
    where: { pipelineRunId: run.id, globalRecordId: partner.id }
  })

  if (existingRef) {
    await prisma.pipelineRecordRef.update({
      where: { id: existingRef.id },
      data: { assigneeId: user.id }
    })
    console.log('Updated existing PipelineRecordRef assignee')
  } else {
    await prisma.pipelineRecordRef.create({
      data: {
        pipelineRunId: run.id,
        stepId: step.id,
        globalRecordId: partner.id,
        addedBy: user.id,
        addMethod: 'MANUAL',
        assigneeId: user.id
      }
    })
    console.log('Created new PipelineRecordRef')
  }

  // Force sync history days to 30 temporarily if it uses SystemConfig, or just call sync
  // Wait, the prompt says "Následně synchronizuj do minulosti všechny maily za posledních 30 dní."
  // syncGmailForUser uses lastGmailSync, so if we reset lastGmailSync to 30 days ago, it will sync 30 days.
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  await prisma.user.update({
    where: { id: user.id },
    data: { lastGmailSync: thirtyDaysAgo }
  })
  console.log('Reset user lastGmailSync to 30 days ago')

  const { $fetch } = await import('ofetch')
  ;(globalThis as any).$fetch = $fetch
  ;(globalThis as any).useRuntimeConfig = () => ({
    googleClientId: process.env.NUXT_GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.NUXT_GOOGLE_CLIENT_SECRET,
  })

  // Run sync
  const { syncGmailForUser: runSync } = await import('../server/utils/gmail-sync')
  const result = await runSync(user.id)
  console.log('Sync result:', result)
}

main().catch(console.error).finally(() => prisma.$disconnect())
