import { relationId } from '@/lib/latest-revision'
import { requireAuth } from '@/lib/session'
import type { ApprovalDoc, Campaign, CommentDoc } from '@/lib/types'

import { CampaignsHome } from './CampaignsHome'

export default async function HomePage() {
  const { payload, user, session } = await requireAuth('/')
  const result = await payload.find({
    collection: 'campaigns',
    sort: '-updatedAt',
    limit: 100,
    depth: 0,
    user,
    overrideAccess: false,
  })

  const campaigns = result.docs as unknown as Campaign[]
  const ids = campaigns.map((campaign) => campaign.id)

  let comments: CommentDoc[] = []
  let approvals: ApprovalDoc[] = []
  if (ids.length > 0) {
    const [commentsResult, approvalsResult] = await Promise.all([
      payload.find({
        collection: 'comments',
        where: { and: [{ campaign: { in: ids } }, { status: { equals: 'open' } }] },
        limit: 500,
        depth: 0,
        user,
        overrideAccess: false,
      }),
      payload.find({
        collection: 'approvals',
        where: { campaign: { in: ids } },
        limit: 500,
        depth: 0,
        user,
        overrideAccess: false,
      }),
    ])
    comments = commentsResult.docs as unknown as CommentDoc[]
    approvals = approvalsResult.docs as unknown as ApprovalDoc[]
  }

  const listed = campaigns.map((campaign) => {
    const latestId = relationId(campaign.latestRevision)
    return {
      ...campaign,
      openComments: comments.filter((comment) => relationId(comment.campaign) === campaign.id).length,
      approvalCount: approvals.filter(
        (approval) =>
          relationId(approval.campaign) === campaign.id && relationId(approval.revision) === latestId,
      ).length,
      hasRevision: Boolean(latestId),
    }
  })

  return <CampaignsHome user={session} campaigns={listed} />
}
