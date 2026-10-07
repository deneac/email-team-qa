import type { CollectionConfig } from 'payload'

import { adminField, adminOnly, authenticated, isAdminUser } from '@/access/roles'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'role'],
  },
  auth: true,
  access: {
    admin: ({ req: { user } }) => isAdminUser(user),
    create: async ({ req }) => {
      if (isAdminUser(req.user)) return true
      const { totalDocs } = await req.payload.count({
        collection: 'users',
        overrideAccess: true,
      })
      return totalDocs === 0
    },
    delete: adminOnly,
    read: authenticated,
    update: ({ req: { user } }) => {
      if (!user) return false
      if (isAdminUser(user)) return true
      return { id: { equals: user.id } }
    },
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'reviewer',
      saveToJWT: true,
      options: [
        { label: 'Reviewer', value: 'reviewer' },
        { label: 'Admin', value: 'admin' },
      ],
      access: {
        update: adminField,
      },
      admin: {
        description: 'Everyone defaults to reviewer. Only admins can promote someone.',
        position: 'sidebar',
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const { totalDocs } = await req.payload.count({
          collection: 'users',
          overrideAccess: true,
        })
        if (totalDocs === 0) {
          data.role = 'admin'
        } else if (!data.role) {
          data.role = 'reviewer'
        }
        return data
      },
    ],
  },
  versions: false,
}
