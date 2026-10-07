import type { PayloadRequest } from 'payload'

export type ActivityType =
  | 'comment.add'
  | 'comment.delete'
  | 'comment.reply'
  | 'comment.resolve'
  | 'comment.reopen'
  | 'approval.add'
  | 'approval.withdraw'
  | 'revision.create'

type RecordActivityArgs = {
  req: PayloadRequest
  type: ActivityType
  campaign: string
  revision?: string | null
  comment?: string | null
  viewport?: string | null
  category?: string | null
  textPreview?: string | null
}

export async function recordActivity({
  req,
  type,
  campaign,
  revision,
  comment,
  viewport,
  category,
  textPreview,
}: RecordActivityArgs): Promise<void> {
  if (!req.user) return

  await req.payload.create({
    collection: 'activity',
    data: {
      type,
      campaign,
      revision: revision || undefined,
      comment: comment || undefined,
      author: req.user.id,
      viewport: viewport || undefined,
      category: category || undefined,
      textPreview: textPreview || undefined,
    },
    req,
    overrideAccess: true,
    context: { skipHooks: true },
  })
}
