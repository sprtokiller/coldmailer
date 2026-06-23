import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const interactions = await prisma.interaction.findMany({
    where: { projectId: 'project-tda27' },
    include: { globalRecord: { select: { canonicalName: true } } }
  })
  console.log("Interactions in project:", interactions.map(i => ({
    type: i.type,
    partner: i.globalRecord.canonicalName,
    content: i.content,
  })))
}
main().catch(console.error).finally(() => prisma.$disconnect())
