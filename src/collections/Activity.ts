import type { CollectionConfig } from 'payload'

import { authenticated, isAdminUser } from '@/access/roles'

export const Activity: CollectionConfig = {
  slug: 'activity',
  admin: {
    useAsTitle: 'type',
    defaultColumns: ['type', 'author', 'campaign', 'createdAt'],
    group: 'Email QA',
  },
  access: {
    admin: ({ req: { user } }) => isAdminUser(user),
    create: () => false,
    delete: ({ req: { user } }) => isAdminUser(user),
    read: authenticated,
    update: () => false,
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
      admin: { position: 'sidebar' },
    },
    {
      name: 'comment',
      type: 'relationship',
      relationTo: 'comments',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Comment added', value: 'comment.add' },
        { label: 'Comment deleted', value: 'comment.delete' },
        { label: 'Comment reply', value: 'comment.reply' },
        { label: 'Comment resolved', value: 'comment.resolve' },
        { label: 'Comment reopened', value: 'comment.reopen' },
        { label: 'Approval added', value: 'approval.add' },
        { label: 'Approval withdrawn', value: 'approval.withdraw' },
        { label: 'Revision created', value: 'revision.create' },
      ],
    },
    {
      name: 'viewport',
      type: 'text',
    },
    {
      name: 'category',
      type: 'text',
    },
    {
      name: 'textPreview',
      type: 'text',
    },
  ],
  timestamps: true,
  versions: false,
  defaultSort: '-createdAt',
}
