import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated, isAdminUser } from '@/access/roles'
import { importDesignStudio } from '@/endpoints/import-design-studio'
import { listDesignStudioEmails } from '@/endpoints/list-design-studio'
import { deleteCampaignRelations } from '@/lib/delete-campaign-relations'

export const Campaigns: CollectionConfig = {
  slug: 'campaigns',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'subject', 'shipped', 'updatedAt'],
    group: 'Email QA',
  },
  access: {
    admin: ({ req: { user } }) => isAdminUser(user),
    create: adminOnly,
    delete: adminOnly,
    read: authenticated,
    update: adminOnly,
  },
  endpoints: [
    {
      path: '/design-studio',
      method: 'get',
      handler: listDesignStudioEmails,
    },
    {
      path: '/:id/import-design-studio',
      method: 'post',
      handler: importDesignStudio,
    },
  ],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'slug',
      type: 'slug',
      useAsSlug: 'title',
    },
    {
      name: 'fromName',
      type: 'text',
    },
    {
      name: 'subject',
      type: 'text',
    },
    {
      name: 'subjectB',
      type: 'text',
      admin: {
        condition: (data) => Boolean(data?.abEnabled),
      },
    },
    {
      name: 'abEnabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'shipped',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Admins mark this when the email has gone out.',
      },
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'latestRevision',
      type: 'relationship',
      relationTo: 'revisions',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'designStudioEmailId',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'Last imported Design Studio email UUID',
      },
    },
    {
      name: 'revisions',
      type: 'join',
      collection: 'revisions',
      on: 'campaign',
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, req }) => {
        if (operation === 'create' && req.user && !data.owner) {
          data.owner = req.user.id
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        await deleteCampaignRelations(req, String(id))
      },
    ],
  },
  timestamps: true,
  versions: false,
  defaultSort: '-updatedAt',
}
