import { APIError, type PayloadHandler } from 'payload'

import { isAdminUser } from '@/access/roles'
import { getDesignStudioEmailFromCio } from '@/lib/design-studio'
import { extractPreheader } from '@/lib/email-preview'

export const importDesignStudio: PayloadHandler = async (req) => {
  if (!req.user) {
    throw new APIError('Unauthorized', 401)
  }
  if (!isAdminUser(req.user)) {
    throw new APIError('Only admins can import from Design Studio', 403)
  }

  const rawId = req.routeParams?.id
  const campaignId = Array.isArray(rawId) ? rawId[0] : rawId
  if (typeof campaignId !== 'string' || !campaignId) {
    throw new APIError('Campaign id is required', 400)
  }

  const body = ((await req.json?.()) || {}) as { emailId?: string }
  if (!body?.emailId) {
    throw new APIError('emailId is required', 400)
  }

  const email = await getDesignStudioEmailFromCio(body.emailId)
  const campaign = await req.payload.findByID({
    collection: 'campaigns',
    id: campaignId,
    depth: 0,
    req,
    overrideAccess: false,
  })

  const revision = await req.payload.create({
    collection: 'revisions',
    data: {
      campaign: campaignId,
      number: 1,
      html: email.html,
      preheader: email.preheader || extractPreheader(email.html),
      source: 'design-studio',
      designStudioEmailId: email.id,
      designStudioName: email.name,
    },
    req,
    overrideAccess: false,
  })

  const campaignUpdate: Record<string, unknown> = {
    designStudioEmailId: email.id,
  }
  if (!campaign.subject && email.subject) campaignUpdate.subject = email.subject
  if (!campaign.fromName && email.fromName) campaignUpdate.fromName = email.fromName
  if (!campaign.title || campaign.title === 'Untitled campaign') {
    campaignUpdate.title = email.name
  }

  await req.payload.update({
    collection: 'campaigns',
    id: campaignId,
    data: campaignUpdate,
    req,
    overrideAccess: false,
  })

  return Response.json({ revision, email: { id: email.id, name: email.name } })
}
