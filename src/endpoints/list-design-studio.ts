import { APIError, type PayloadHandler } from 'payload'

import { isAdminUser } from '@/access/roles'
import { isDesignStudioConfigured, listDesignStudioEmailsFromCio } from '@/lib/design-studio'

export const listDesignStudioEmails: PayloadHandler = async (req) => {
  if (!req.user) {
    throw new APIError('Unauthorized', 401)
  }
  if (!isAdminUser(req.user)) {
    throw new APIError('Only admins can import from Design Studio', 403)
  }
  if (!isDesignStudioConfigured()) {
    return Response.json({ configured: false, emails: [] })
  }

  const url = req.url ? new URL(req.url, 'http://localhost') : null
  const search = url?.searchParams.get('search') || undefined
  const emails = await listDesignStudioEmailsFromCio(search)
  return Response.json({ configured: true, emails })
}
