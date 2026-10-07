'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { Logo } from '@/components/Logo'
import { api } from '@/lib/api'
import { campaignStatus } from '@/lib/campaign-status'
import { formatRelative } from '@/lib/email-preview'
import { figmaLogoutUrl } from '@/lib/sso'
import type { Campaign, SessionUser } from '@/lib/types'

export function CampaignsHome({
  user,
  campaigns,
}: {
  user: SessionUser
  campaigns: Campaign[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return campaigns
    return campaigns.filter((campaign) => {
      const status = campaignStatus({
        shipped: campaign.shipped,
        hasRevision: Boolean(campaign.hasRevision),
        approvalCount: campaign.approvalCount || 0,
        openComments: campaign.openComments || 0,
      })
      return `${campaign.title} ${campaign.subject || ''} ${campaign.fromName || ''} ${status.text}`.toLowerCase().includes(q)
    })
  }, [campaigns, search])

  function logout() {
    window.location.href = figmaLogoutUrl('/login', window.location.origin)
  }

  async function createCampaign(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setCreating(true)
    setError('')
    try {
      const created = await api<Campaign>('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim() }),
      })
      if (!created.slug) {
        throw new Error('Campaign was created without a URL. Refresh and open it from the list.')
      }
      router.push(`/c/${created.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create campaign')
      setCreating(false)
    }
  }

  async function deleteCampaign(event: React.MouseEvent, campaign: Campaign) {
    event.preventDefault()
    event.stopPropagation()
    if (
      !window.confirm(
        `Delete “${campaign.title}”? This removes its HTML revisions, comments, and approvals.`,
      )
    ) {
      return
    }
    setDeletingId(campaign.id)
    setError('')
    try {
      await api(`/api/campaigns/${campaign.id}`, { method: 'DELETE' })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete campaign')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="home-shell">
      <div className="home-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <h1>
              <Logo /> Email QA
            </h1>
            <p className="home-lede">Open a campaign to preview, comment, and approve.</p>
          </div>
          <div className="user-menu">
            <span>{user.email}</span>
            {user.role === 'admin' ? <a href="/admin">Admin</a> : null}
            <button className="ghost tiny" type="button" onClick={logout}>
              Log out
            </button>
          </div>
        </div>

        <div className="campaigns-toolbar">
          <input
            type="search"
            placeholder="Search campaigns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {user.role === 'admin' ? (
          <form onSubmit={createCampaign} className="btn-row" style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="New campaign name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="primary" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create campaign'}
            </button>
          </form>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}

        {filtered.length === 0 ? (
          <div className="empty">No campaigns yet{user.role === 'admin' ? ' — create one to start review.' : '.'}</div>
        ) : (
          <div className="campaigns-list">
            {filtered.map((campaign) => {
              const status = campaignStatus({
                shipped: campaign.shipped,
                hasRevision: Boolean(campaign.hasRevision),
                approvalCount: campaign.approvalCount || 0,
                openComments: campaign.openComments || 0,
              })
              return (
                <Link key={campaign.id} href={`/c/${campaign.slug || campaign.id}`} className="campaign-row">
                  <div>
                    <div className="name">{campaign.title}</div>
                    <div className="subject">{campaign.subject || '(no subject)'}</div>
                    <div className="campaign-pills">
                      <span className={`status-badge ${status.cls}`}>{status.text}</span>
                      <span className="status-badge">{campaign.openComments || 0} open</span>
                    </div>
                    <div className="meta">
                      {campaign.fromName ? <span>{campaign.fromName}</span> : null}
                      {campaign.updatedAt ? <span>Updated {formatRelative(campaign.updatedAt)}</span> : null}
                    </div>
                  </div>
                  <div className="campaign-row-actions">
                    <button className="tiny" type="button">
                      Open
                    </button>
                    {user.role === 'admin' ? (
                      <button
                        className="tiny danger"
                        type="button"
                        disabled={deletingId === campaign.id}
                        onClick={(event) => deleteCampaign(event, campaign)}
                      >
                        {deletingId === campaign.id ? 'Deleting…' : 'Delete'}
                      </button>
                    ) : null}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
