import { APIError, type PayloadRequest } from 'payload'

export async function assertLatestRevision(
  req: PayloadRequest,
  revisionId: string,
): Promise<void> {
  const revision = await req.payload.findByID({
    collection: 'revisions',
    id: revisionId,
    depth: 0,
    req,
    overrideAccess: true,
  })

  const campaignId =
    typeof revision.campaign === 'object' && revision.campaign
      ? revision.campaign.id
      : revision.campaign

  const campaign = await req.payload.findByID({
    collection: 'campaigns',
    id: campaignId,
    depth: 0,
    req,
    overrideAccess: true,
  })

  const latestId =
    typeof campaign.latestRevision === 'object' && campaign.latestRevision
      ? campaign.latestRevision.id
      : campaign.latestRevision

  if (!latestId || String(latestId) !== String(revisionId)) {
    throw new APIError('Comments and approvals are only allowed on the latest revision', 400)
  }
}

export function relationId(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'object' && value && 'id' in value) {
    return String((value as { id: string | number }).id)
  }
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return null
}
