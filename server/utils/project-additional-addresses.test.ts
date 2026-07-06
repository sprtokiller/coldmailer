import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('~/server/utils/prisma', () => ({
  prisma: {
    negotiation: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    negotiationAddress: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    negotiationBlacklistedAddress: {
      findUnique: vi.fn(),
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
    vi.mocked(prisma.negotiation.upsert).mockResolvedValue({ id: 'n1' } as never)
  })

  it('skips blacklisted addresses', async () => {
    vi.mocked(prisma.negotiationBlacklistedAddress.findUnique).mockResolvedValue({ id: 'b1' } as never)

    const result = await appendProjectAdditionalAddress('p1', 'g1', 'blocked@test.com')
    expect(result).toBe(false)
    expect(prisma.negotiationAddress.create).not.toHaveBeenCalled()
  })

  it('appends normalized address when not present', async () => {
    vi.mocked(prisma.negotiationBlacklistedAddress.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.negotiationAddress.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.negotiationAddress.create).mockResolvedValue({} as never)

    const result = await appendProjectAdditionalAddress('p1', 'g1', '  New@Test.com ')
    expect(result).toBe(true)
    expect(prisma.negotiationAddress.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { negotiationId: 'n1', address: 'new@test.com' },
      }),
    )
  })

  it('skips duplicate address already present', async () => {
    vi.mocked(prisma.negotiationBlacklistedAddress.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.negotiationAddress.findUnique).mockResolvedValue({ id: 'a1' } as never)

    const result = await appendProjectAdditionalAddress('p1', 'g1', 'existing@test.com')
    expect(result).toBe(false)
    expect(prisma.negotiationAddress.create).not.toHaveBeenCalled()
  })
})

describe('removeProjectAdditionalAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the matching address row', async () => {
    vi.mocked(prisma.negotiation.findUnique).mockResolvedValue({ id: 'n1' } as never)
    vi.mocked(prisma.negotiationAddress.deleteMany).mockResolvedValue({ count: 1 } as never)

    await removeProjectAdditionalAddress('p1', 'g1', 'only@test.com')
    expect(prisma.negotiationAddress.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { negotiationId: 'n1', address: 'only@test.com' },
      }),
    )
  })

  it('does nothing when negotiation does not exist', async () => {
    vi.mocked(prisma.negotiation.findUnique).mockResolvedValue(null)

    await removeProjectAdditionalAddress('p1', 'g1', 'only@test.com')
    expect(prisma.negotiationAddress.deleteMany).not.toHaveBeenCalled()
  })
})

describe('trackCustomRecipientAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not append when global contact exists', async () => {
    vi.mocked(prisma.partnerContact.findUnique).mockResolvedValue({ id: 'c1' } as never)

    await trackCustomRecipientAddress('p1', 'g1', 'known@test.com')
    expect(prisma.negotiation.upsert).not.toHaveBeenCalled()
  })
})
