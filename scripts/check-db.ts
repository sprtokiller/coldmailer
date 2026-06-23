import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  console.log("Users:", users.map(u => ({ id: u.id, email: u.email, name: u.name })))

  const projects = await prisma.project.findMany()
  console.log("Projects:", projects.map(p => ({ id: p.id, name: p.name })))

  const partners = await prisma.globalRecord.findMany({
    where: { type: 'PARTNER' },
    include: {
      contacts: true,
      pipelineRefs: true,
    }
  })
  console.log("Partners:")
  for (const p of partners) {
    console.log(`- ID: ${p.id}, Name: ${p.canonicalName}`)
    console.log(`  Contacts:`, p.contacts)
    console.log(`  PipelineRefs:`, p.pipelineRefs)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
