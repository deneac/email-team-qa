export type CampaignStatusClass = 'draft' | 'review' | 'approved' | 'shipped'

export type CampaignStatus = {
  cls: CampaignStatusClass
  text: string
}

export function campaignStatus(input: {
  shipped?: boolean | null
  hasRevision: boolean
  approvalCount: number
  openComments: number
}): CampaignStatus {
  if (input.shipped) return { cls: 'shipped', text: 'Shipped' }
  if (input.approvalCount > 0) {
    return {
      cls: 'approved',
      text: `${input.approvalCount} approval${input.approvalCount === 1 ? '' : 's'}`,
    }
  }
  if (input.openComments > 0) return { cls: 'review', text: 'In review' }
  if (input.hasRevision) return { cls: 'review', text: 'Ready for review' }
  return { cls: 'draft', text: 'Draft' }
}
