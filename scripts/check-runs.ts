import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const runs = await prisma.pipelineRun.findMany({
    where: { projectId: 'project-tda27' },
    include: { steps: true }
  })
  console.log(JSON.stringify(runs, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
