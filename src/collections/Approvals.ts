import type { CollectionConfig } from 'payload'

import { APIError } from 'payload'

import { authenticated, isAdminUser } from '@/access/roles'
import { recordActivity } from '@/lib/activity'
import { assertLatestRevision, relationId } from '@/lib/latest-revision'

export const Approvals: CollectionConfig = {
  slug: 'approvals',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['author', 'revision', 'createdAt'],
    group: 'Email QA',
  },
  access: {
    admin: ({ req: { user } }) => isAdminUser(user),
    create: authenticated,
    delete: ({ req: { user } }) => {
      if (!user) return false
      if (isAdminUser(user)) return true
      return { author: { equals: user.id } }
    },
    read: authenticated,
    update: ({ req: { user } }) => {
      if (!user) return false
      if (isAdminUser(user)) return true
      return { author: { equals: user.id } }
    },
  },
  fields: [
    {
      name: 'campaign',
      type: 'relationship',
      relationTo: 'campaigns',
      required: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'revision',
      type: 'relationship',
      relationTo: 'revisions',
      required: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar', readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation !== 'create' || !req.user) return data
        data.author = req.user.id
        if (data.revision) {
          await assertLatestRevision(req, String(data.revision))
        }

        const existing = await req.payload.find({
          collection: 'approvals',
          where: {
            and: [
              { revision: { equals: data.revision } },
              { author: { equals: req.user.id } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })

        if (existing.docs.length > 0) {
          throw new APIError('You have already approved this revision', 400)
        }

        return data
      },
    ],
    afterChange: [
      async ({ doc, operation, req, context }) => {
        if (context.skipHooks || operation !== 'create') return doc
        const campaignId = relationId(doc.campaign)
        if (!campaignId) return doc
        await recordActivity({
          req,
          type: 'approval.add',
          campaign: campaignId,
          revision: relationId(doc.revision),
        })
        return doc
      },
    ],
    afterDelete: [
      async ({ doc, req, context }) => {
        if (context.skipHooks) return
        const campaignId = relationId(doc.campaign)
        if (!campaignId) return
        await recordActivity({
          req,
          type: 'approval.withdraw',
          campaign: campaignId,
          revision: relationId(doc.revision),
        })
      },
    ],
  },
  timestamps: true,
  versions: false,
  defaultSort: '-createdAt',
}
