import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import type { User } from '@/payload-types'

let payload: Payload
let adminId: string
let reviewerId: string

function asUser(id: string, role: User['role']): User {
  return {
    id,
    role,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    collection: 'users',
  }
}

describe('Campaigns access', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })

    const admin = await payload.create({
      collection: 'users',
      data: {
        email: `admin-${Date.now()}@figma.com`,
        role: 'admin',
      },
    })
    const reviewer = await payload.create({
      collection: 'users',
      data: {
        email: `reviewer-${Date.now()}@figma.com`,
        role: 'reviewer',
      },
    })
    adminId = admin.id
    reviewerId = reviewer.id
  })

  afterAll(async () => {
    if (adminId) {
      await payload.delete({ collection: 'users', id: adminId }).catch(() => undefined)
    }
    if (reviewerId) {
      await payload.delete({ collection: 'users', id: reviewerId }).catch(() => undefined)
    }
  })

  it('defaults new users to reviewer when role is omitted', async () => {
    const created = await payload.create({
      collection: 'users',
      data: {
        email: `default-${Date.now()}@figma.com`,
      },
    })
    expect(created.role).toBe('reviewer')
    await payload.delete({ collection: 'users', id: created.id })
  })

  it('lets admins create campaigns and reviewers read them', async () => {
    const slug = `qa-access-test-${Date.now()}`
    const campaign = await payload.create({
      collection: 'campaigns',
      data: { title: 'QA Access Test', slug },
      user: asUser(adminId, 'admin'),
      overrideAccess: false,
    })

    expect(campaign.slug).toBeTruthy()

    const visible = await payload.find({
      collection: 'campaigns',
      where: { id: { equals: campaign.id } },
      user: asUser(reviewerId, 'reviewer'),
      overrideAccess: false,
    })
    expect(visible.totalDocs).toBe(1)

    await expect(
      payload.create({
        collection: 'campaigns',
        data: { title: 'Should fail', slug: `should-fail-${Date.now()}` },
        user: asUser(reviewerId, 'reviewer'),
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    await payload.delete({ collection: 'campaigns', id: campaign.id })
  })

  it('lets admins delete campaigns and blocks reviewers', async () => {
    const campaign = await payload.create({
      collection: 'campaigns',
      data: { title: 'QA Delete Test', slug: `qa-delete-test-${Date.now()}` },
      user: asUser(adminId, 'admin'),
      overrideAccess: false,
    })

    await expect(
      payload.delete({
        collection: 'campaigns',
        id: campaign.id,
        user: asUser(reviewerId, 'reviewer'),
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    await payload.delete({
      collection: 'campaigns',
      id: campaign.id,
      user: asUser(adminId, 'admin'),
      overrideAccess: false,
    })

    const remaining = await payload.find({
      collection: 'campaigns',
      where: { id: { equals: campaign.id } },
      overrideAccess: true,
    })
    expect(remaining.totalDocs).toBe(0)
  })
})
