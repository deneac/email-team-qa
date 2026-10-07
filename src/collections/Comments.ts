import type { CollectionConfig } from 'payload'

import { authenticated, isAdminUser } from '@/access/roles'
import { recordActivity } from '@/lib/activity'
import { assertLatestRevision, relationId } from '@/lib/latest-revision'

export const Comments: CollectionConfig = {
  slug: 'comments',
  admin: {
    useAsTitle: 'text',
    defaultColumns: ['text', 'author', 'status', 'revision', 'createdAt'],
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
    update: authenticated,
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
    {
      name: 'text',
      type: 'textarea',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Copy', value: 'copy' },
        { label: 'Design', value: 'design' },
        { label: 'Bug', value: 'bug' },
        { label: 'Question', value: 'question' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Resolved', value: 'resolved' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'statusUpdatedAt',
      type: 'date',
      admin: { readOnly: true },
    },
    {
      name: 'statusUpdatedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true },
    },
    {
      name: 'viewport',
      type: 'select',
      required: true,
      options: [
        { label: 'Mobile', value: 'mobile' },
        { label: 'Desktop', value: 'desktop' },
      ],
    },
    {
      name: 'x',
      type: 'number',
      required: true,
    },
    {
      name: 'y',
      type: 'number',
      required: true,
    },
    {
      name: 'replies',
      type: 'array',
      fields: [
        {
          name: 'author',
          type: 'relationship',
          relationTo: 'users',
          required: true,
        },
        {
          name: 'text',
          type: 'textarea',
          required: true,
        },
        {
          name: 'createdAt',
          type: 'date',
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (!req.user) return data

        if (operation === 'create') {
          data.author = req.user.id
          if (data.revision) {
            await assertLatestRevision(req, String(data.revision))
          }
          return data
        }

        const authorId = relationId(originalDoc?.author)
        const isAuthor = String(authorId) === String(req.user.id)
        const admin = isAdminUser(req.user)

        if (!isAuthor && !admin) {
          if (typeof data.text === 'string' && data.text !== originalDoc?.text) {
            data.text = originalDoc?.text
          }
          if (data.x != null && data.x !== originalDoc?.x) data.x = originalDoc?.x
          if (data.y != null && data.y !== originalDoc?.y) data.y = originalDoc?.y
        }

        if (data.status && data.status !== originalDoc?.status) {
          data.statusUpdatedAt = new Date().toISOString()
          data.statusUpdatedBy = req.user.id
        }

        if (Array.isArray(data.replies)) {
          data.replies = data.replies.map((reply: { author?: unknown; createdAt?: string }) => ({
            ...reply,
            author: reply.author || req.user?.id,
            createdAt: reply.createdAt || new Date().toISOString(),
          }))
        }

        return data
      },
    ],
    afterChange: [
      async ({ doc, operation, previousDoc, req, context }) => {
        if (context.skipHooks) return doc
        const campaignId = relationId(doc.campaign)
        const revisionId = relationId(doc.revision)
        if (!campaignId) return doc

        if (operation === 'create') {
          await recordActivity({
            req,
            type: 'comment.add',
            campaign: campaignId,
            revision: revisionId,
            comment: doc.id,
            viewport: doc.viewport,
            category: doc.category,
            textPreview: String(doc.text || '').slice(0, 80),
          })
          return doc
        }

        if (previousDoc?.status !== doc.status) {
          await recordActivity({
            req,
            type: doc.status === 'resolved' ? 'comment.resolve' : 'comment.reopen',
            campaign: campaignId,
            revision: revisionId,
            comment: doc.id,
          })
        }

        const prevReplies = Array.isArray(previousDoc?.replies) ? previousDoc.replies.length : 0
        const nextReplies = Array.isArray(doc.replies) ? doc.replies.length : 0
        if (nextReplies > prevReplies) {
          const latest = doc.replies[nextReplies - 1]
          await recordActivity({
            req,
            type: 'comment.reply',
            campaign: campaignId,
            revision: revisionId,
            comment: doc.id,
            textPreview: String(latest?.text || '').slice(0, 80),
          })
        }

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
          type: 'comment.delete',
          campaign: campaignId,
          revision: relationId(doc.revision),
          comment: doc.id,
        })
      },
    ],
  },
  timestamps: true,
  versions: false,
  defaultSort: '-createdAt',
}
