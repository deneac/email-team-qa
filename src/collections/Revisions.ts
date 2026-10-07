import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'

import { adminOnly, authenticated, isAdminUser } from '@/access/roles'
import { hashString } from '@/lib/hash'
import { recordActivity } from '@/lib/activity'
import { relationId } from '@/lib/latest-revision'

const setRevisionMeta: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !data) return data

  const campaignId = relationId(data.campaign)
  if (campaignId == null) return data

  const existing = await req.payload.find({
    collection: 'revisions',
    where: { campaign: { equals: campaignId } },
    sort: '-number',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const lastNumber = existing.docs[0]?.number
  data.number = typeof lastNumber === 'number' ? lastNumber + 1 : 1

  if (typeof data.html === 'string') {
    data.htmlHash = hashString(data.html)
  }

  if (req.user && !data.createdBy) {
    data.createdBy = req.user.id
  }

  return data
}

export const Revisions: CollectionConfig = {
  slug: 'revisions',
  admin: {
    useAsTitle: 'number',
    defaultColumns: ['number', 'campaign', 'source', 'createdAt'],
    group: 'Email QA',
  },
  access: {
    admin: ({ req: { user } }) => isAdminUser(user),
    create: adminOnly,
    delete: adminOnly,
    read: authenticated,
    update: adminOnly,
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
      name: 'number',
      type: 'number',
      required: true,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'html',
      type: 'textarea',
      required: true,
      // Payload defaults textarea to 40k chars; a real email is often larger.
      maxLength: 5_000_000,
    },
    {
      name: 'htmlHash',
      type: 'text',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'preheader',
      type: 'text',
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'paste',
      options: [
        { label: 'Pasted HTML', value: 'paste' },
        { label: 'Design Studio', value: 'design-studio' },
        { label: 'Sample', value: 'sample' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'designStudioEmailId',
      type: 'text',
      admin: { position: 'sidebar' },
    },
    {
      name: 'designStudioName',
      type: 'text',
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'personalization',
      type: 'json',
    },
  ],
  hooks: {
    beforeValidate: [setRevisionMeta],
    afterChange: [
      async ({ doc, operation, req, context }) => {
        if (context.skipHooks) return doc
        const campaignId = relationId(doc.campaign)
        if (!campaignId) return doc

        try {
          await req.payload.update({
            collection: 'campaigns',
            id: campaignId,
            data: { latestRevision: doc.id },
            req,
            overrideAccess: true,
            context: { skipHooks: true },
          })
        } catch (err) {
          req.payload.logger.error({ err, msg: 'Failed to set latestRevision on campaign' })
        }

        if (operation === 'create') {
          try {
            await recordActivity({
              req,
              type: 'revision.create',
              campaign: campaignId,
              revision: doc.id,
              textPreview: `Revision ${doc.number}`,
            })
          } catch (err) {
            req.payload.logger.error({ err, msg: 'Failed to record revision.create activity' })
          }
        }

        return doc
      },
    ],
  },
  timestamps: true,
  versions: false,
  defaultSort: '-number',
}
