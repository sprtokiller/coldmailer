import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('~/server/utils/prisma', () => ({
  prisma: {
    projectRecord: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    partnerContact: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '~/server/utils/prisma'
import {
  appendProjectAdditionalAddress,
  removeProjectAdditionalAddress,
  trackCustomRecipientAddress,
} from './project-additional-addresses'

describe('appendProjectAdditionalAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips blacklisted addresses', async () => {
    vi.mocked(prisma.projectRecord.findUnique).mockResolvedValue({
      contactBlacklist: ['blocked@test.com'],
      additionalAddresses: [],
    } as never)

    const result = await appendProjectAdditionalAddress('p1', 'g1', 'blocked@test.com')
    expect(result).toBe(false)
    expect(prisma.projectRecord.upsert).not.toHaveBeenCalled()
  })

  it('appends normalized address when not present', async () => {
    vi.mocked(prisma.projectRecord.findUnique).mockResolvedValue({
      contactBlacklist: [],
      additionalAddresses: ['existing@test.com'],
    } as never)
    vi.mocked(prisma.projectRecord.upsert).mockResolvedValue({} as never)

    const result = await appendProjectAdditionalAddress('p1', 'g1', '  New@Test.com ')
    expect(result).toBe(true)
    expect(prisma.projectRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { additionalAddresses: ['existing@test.com', 'new@test.com'] },
      }),
    )
  })
})

describe('removeProjectAdditionalAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears additionalAddresses when last entry removed', async () => {
    vi.mocked(prisma.projectRecord.findUnique).mockResolvedValue({
      additionalAddresses: ['only@test.com'],
    } as never)

    await removeProjectAdditionalAddress('p1', 'g1', 'only@test.com')
    expect(prisma.projectRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { additionalAddresses: null },
      }),
    )
  })
})

describe('trackCustomRecipientAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not append when global contact exists', async () => {
    vi.mocked(prisma.partnerContact.findUnique).mockResolvedValue({ id: 'c1' } as never)

    await trackCustomRecipientAddress('p1', 'g1', 'known@test.com')
    expect(prisma.projectRecord.findUnique).not.toHaveBeenCalled()
  })
})
