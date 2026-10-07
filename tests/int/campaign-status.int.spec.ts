import { describe, expect, it } from 'vitest'

import { campaignStatus } from '@/lib/campaign-status'

describe('campaignStatus', () => {
  it('prefers shipped over approvals and comments', () => {
    expect(
      campaignStatus({
        shipped: true,
        hasRevision: true,
        approvalCount: 2,
        openComments: 4,
      }),
    ).toEqual({ cls: 'shipped', text: 'Shipped' })
  })

  it('shows approval count before review', () => {
    expect(
      campaignStatus({
        shipped: false,
        hasRevision: true,
        approvalCount: 1,
        openComments: 3,
      }),
    ).toEqual({ cls: 'approved', text: '1 approval' })
  })

  it('shows open comments while in review', () => {
    expect(
      campaignStatus({
        shipped: false,
        hasRevision: true,
        approvalCount: 0,
        openComments: 2,
      }),
    ).toEqual({ cls: 'review', text: 'In review' })
  })

  it('falls back to draft when there is no revision', () => {
    expect(
      campaignStatus({
        shipped: false,
        hasRevision: false,
        approvalCount: 0,
        openComments: 0,
      }),
    ).toEqual({ cls: 'draft', text: 'Draft' })
  })
})
