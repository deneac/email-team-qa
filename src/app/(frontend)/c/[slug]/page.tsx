import { notFound } from 'next/navigation'

import { requireAuth } from '@/lib/session'
import type { ActivityDoc, ApprovalDoc, Campaign, CommentDoc, Revision } from '@/lib/types'

import { ReviewClient } from './ReviewClient'

type Args = { params: Promise<{ slug: string }> }

export default async function CampaignPage({ params }: Args) {
  const { slug } = await params
  const { payload, user, session } = await requireAuth(`/c/${slug}`)

  const found = await payload.find({
    collection: 'campaigns',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    user,
    overrideAccess: false,
  })

  const campaign = found.docs[0] as unknown as Campaign | undefined
  if (!campaign) notFound()

  const revisionsResult = await payload.find({
    collection: 'revisions',
    where: { campaign: { equals: campaign.id } },
    sort: '-number',
    limit: 100,
    depth: 0,
    user,
    overrideAccess: false,
  })
  const revisions = revisionsResult.docs as unknown as Revision[]
  const latest = revisions[0] || null

  const commentsResult = await payload.find({
    collection: 'comments',
    where: { campaign: { equals: campaign.id } },
    sort: '-createdAt',
    limit: 200,
    depth: 1,
    user,
    overrideAccess: false,
  })

  const approvalsResult = await payload.find({
    collection: 'approvals',
    where: { campaign: { equals: campaign.id } },
    sort: '-createdAt',
    limit: 100,
    depth: 1,
    user,
    overrideAccess: false,
  })

  const activityResult = await payload.find({
    collection: 'activity',
    where: { campaign: { equals: campaign.id } },
    sort: '-createdAt',
    limit: 200,
    depth: 1,
    user,
    overrideAccess: false,
  })

  return (
    <ReviewClient
      user={session}
      campaign={campaign}
      revisions={revisions}
      initialRevisionId={latest?.id || null}
      comments={commentsResult.docs as unknown as CommentDoc[]}
      approvals={approvalsResult.docs as unknown as ApprovalDoc[]}
      activity={activityResult.docs as unknown as ActivityDoc[]}
    />
  )
}
