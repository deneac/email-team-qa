import type { CollectionSlug, PayloadRequest } from 'payload'

const RELATED: CollectionSlug[] = ['comments', 'approvals', 'activity', 'revisions']

async function deleteByCampaign(
  req: PayloadRequest,
  collection: CollectionSlug,
  campaignId: string,
) {
  while (true) {
    const found = await req.payload.find({
      collection,
      where: { campaign: { equals: campaignId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (found.docs.length === 0) break
    for (const doc of found.docs) {
      await req.payload.delete({
        collection,
        id: doc.id,
        overrideAccess: true,
        context: { skipHooks: true },
        req,
      })
    }
    if (!found.hasNextPage) break
  }
}

export async function deleteCampaignRelations(req: PayloadRequest, campaignId: string) {
  await req.payload
    .update({
      collection: 'campaigns',
      id: campaignId,
      data: { latestRevision: null },
      overrideAccess: true,
      context: { skipHooks: true },
      req,
    })
    .catch(() => undefined)

  for (const collection of RELATED) {
    await deleteByCampaign(req, collection, campaignId)
  }
}
