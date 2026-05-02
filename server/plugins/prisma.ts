import { prisma } from '~/server/utils/prisma'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hookOnce('close', async () => {
    await prisma.$disconnect()
  })
})
