'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Logo } from '@/components/Logo'
import { api } from '@/lib/api'
import { campaignStatus } from '@/lib/campaign-status'
import { figmaLogoutUrl } from '@/lib/sso'
import {
  auditLinks,
  colorFor,
  escapeHtml,
  extractPreheader,
  formatDate,
  formatRelative,
  initialOf,
  runPreSendChecks,
  userEmail,
  userId,
  wrapHtml,
  type LinkAuditItem,
  type QaCheck,
} from '@/lib/email-preview'
import { hashString } from '@/lib/hash'
import { Liquid } from '@/lib/liquid'
import { SAMPLE_EMAIL } from '@/lib/sample-email'
import type {
  ActivityDoc,
  ApprovalDoc,
  Campaign,
  CommentDoc,
  DesignStudioListEmail,
  Paginated,
  Revision,
  SessionUser,
} from '@/lib/types'

const POLL_MS = 10000

function toast(message: string, type?: 'error') {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = message
  el.classList.toggle('error', type === 'error')
  el.classList.add('show')
  window.clearTimeout((toast as { _t?: number })._t)
  ;(toast as { _t?: number })._t = window.setTimeout(() => el.classList.remove('show'), 2400)
}

function subjectHelper(value?: string | null) {
  const s = value || ''
  if (!s) return { cls: 'helper', msg: '' }
  if (s.length > 70) return { cls: 'helper danger', msg: `${s.length} chars — too long, Gmail web clips around 70.` }
  if (s.length > 35) return { cls: 'helper warn', msg: `${s.length} chars — Gmail mobile clips around 35.` }
  return { cls: 'helper success', msg: `${s.length} chars — fits Gmail mobile (~35) and web (~70).` }
}

function describeEvent(ev: ActivityDoc) {
  switch (ev.type) {
    case 'comment.add':
      return `pinned a comment${ev.viewport ? ` on ${ev.viewport}` : ''}${ev.category ? ` (${ev.category})` : ''}`
    case 'comment.delete':
      return 'removed a comment'
    case 'comment.reply':
      return 'replied to a comment'
    case 'comment.resolve':
      return 'marked a comment as resolved'
    case 'comment.reopen':
      return 'reopened a resolved comment'
    case 'approval.add':
      return 'approved this revision'
    case 'approval.withdraw':
      return 'withdrew their approval'
    case 'revision.create':
      return 'added a new HTML revision'
    default:
      return ev.type
  }
}

export function ReviewClient({
  user,
  campaign: initialCampaign,
  revisions: initialRevisions,
  initialRevisionId,
  comments: initialComments,
  approvals: initialApprovals,
  activity: initialActivity,
}: {
  user: SessionUser
  campaign: Campaign
  revisions: Revision[]
  initialRevisionId: string | null
  comments: CommentDoc[]
  approvals: ApprovalDoc[]
  activity: ActivityDoc[]
}) {
  const router = useRouter()
  const isAdmin = user.role === 'admin'

  const [campaign, setCampaign] = useState(initialCampaign)
  const [revisions, setRevisions] = useState(initialRevisions)
  const [revisionId, setRevisionId] = useState(initialRevisionId)
  const [comments, setComments] = useState(initialComments)
  const [approvals, setApprovals] = useState(initialApprovals)
  const [activity, setActivity] = useState(initialActivity)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [commentFilter, setCommentFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const [openPinId, setOpenPinId] = useState<string | null>(null)
  const [htmlDraft, setHtmlDraft] = useState(initialRevisions[0]?.html || '')
  const [personalizationValues, setPersonalizationValues] = useState<Record<string, string>>({})
  const [espStubs, setEspStubs] = useState<Record<string, string>>({})
  const [renderedHtml, setRenderedHtml] = useState('')
  const [linkAudit, setLinkAudit] = useState<LinkAuditItem[]>([])
  const [qaChecks, setQaChecks] = useState<QaCheck[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [pendingPin, setPendingPin] = useState<{ viewport: 'mobile' | 'desktop'; x: number; y: number } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentCategory, setCommentCategory] = useState('')
  const [dsOpen, setDsOpen] = useState(false)
  const [dsEmails, setDsEmails] = useState<DesignStudioListEmail[]>([])
  const [dsConfigured, setDsConfigured] = useState(true)
  const [dsSearch, setDsSearch] = useState('')
  const [dsLoading, setDsLoading] = useState(false)
  const [savingRevision, setSavingRevision] = useState(false)
  const [deletingCampaign, setDeletingCampaign] = useState(false)
  const [shipping, setShipping] = useState(false)
  const commentDialog = useRef<HTMLDialogElement>(null)
  const dsDialog = useRef<HTMLDialogElement>(null)
  const mobileFrame = useRef<HTMLIFrameElement>(null)
  const desktopFrame = useRef<HTMLIFrameElement>(null)
  const previewsRef = useRef<HTMLElement>(null)
  const revisionIdRef = useRef(revisionId)
  const revisionsRef = useRef(revisions)
  revisionIdRef.current = revisionId
  revisionsRef.current = revisions

  const revision = revisions.find((item) => item.id === revisionId) || revisions[0] || null
  const latest = revisions[0] || null
  const isLatest = Boolean(revision && latest && revision.id === latest.id)
  const canWrite = isLatest && Boolean(revision)

  const currentComments = comments.filter((comment) => userId(comment.revision) === (revision?.id || ''))
  const stillOpen = comments.filter(
    (comment) => comment.status === 'open' && userId(comment.revision) !== (latest?.id || ''),
  )
  const currentApprovals = approvals.filter((approval) => userId(approval.revision) === (revision?.id || ''))
  const myApproval = currentApprovals.find((approval) => userId(approval.author) === user.id)

  const liquid = useMemo(() => {
    const html = htmlDraft || revision?.html || ''
    if (!Liquid.hasLiquid(html)) return { inputs: [], customTags: [] as string[] }
    try {
      return Liquid.detectInputs(html)
    } catch {
      return { inputs: [], customTags: [] as string[] }
    }
  }, [htmlDraft, revision?.html])

  useEffect(() => {
    const saved = localStorage.getItem('email-qa-theme')
    if (saved === 'dark' || saved === 'light') setTheme(saved)
  }, [])

  useEffect(() => {
    localStorage.setItem('email-qa-theme', theme)
  }, [theme])

  useEffect(() => {
    setHtmlDraft(revision?.html || '')
    const stored = revision?.personalization || {}
    const values = { ...(stored.values || {}) }
    const stubs = { ...(stored.espStubs || {}) }
    if (revision?.html && Liquid.hasLiquid(revision.html)) {
      try {
        const detected = Liquid.detectInputs(revision.html)
        for (const input of detected.inputs) {
          if (values[input.name] == null) values[input.name] = input.suggestedValues[0] || ''
        }
        for (const tag of detected.customTags) {
          if (stubs[tag] == null) {
            if (/unsubscribe/i.test(tag)) stubs[tag] = 'https://example.com/unsubscribe'
            else if (/preferences|preference_center/i.test(tag)) stubs[tag] = 'https://example.com/preferences'
            else if (/view.*browser|web.*version/i.test(tag)) stubs[tag] = 'https://example.com/view'
            else if (/url/i.test(tag)) stubs[tag] = '#'
            else stubs[tag] = ''
          }
        }
      } catch {
        // keep stored values
      }
    }
    setPersonalizationValues(values)
    setEspStubs(stubs)
  }, [revision?.id, revision?.html, revision?.personalization])

  const applyRender = useCallback(() => {
    const html = htmlDraft || revision?.html || ''
    if (!html) {
      setRenderedHtml('')
      return
    }
    if (!Liquid.hasLiquid(html)) {
      setRenderedHtml(html)
      return
    }
    const ctx = {}
    Object.entries(personalizationValues).forEach(([path, value]) => Liquid.setByPath(ctx, path, value))
    try {
      setRenderedHtml(Liquid.render(html, ctx, espStubs))
    } catch {
      setRenderedHtml(html)
    }
  }, [htmlDraft, revision?.html, personalizationValues, espStubs])

  useEffect(() => {
    const handle = window.setTimeout(() => applyRender(), 120)
    return () => window.clearTimeout(handle)
  }, [applyRender])

  const refresh = useCallback(async () => {
    const [revRes, commentRes, approvalRes, activityRes, campaignRes] = await Promise.all([
      api<Paginated<Revision>>(`/api/revisions?where[campaign][equals]=${campaign.id}&sort=-number&limit=100&depth=0`),
      api<Paginated<CommentDoc>>(`/api/comments?where[campaign][equals]=${campaign.id}&sort=-createdAt&limit=200&depth=1`),
      api<Paginated<ApprovalDoc>>(`/api/approvals?where[campaign][equals]=${campaign.id}&sort=-createdAt&limit=100&depth=1`),
      api<Paginated<ActivityDoc>>(`/api/activity?where[campaign][equals]=${campaign.id}&sort=-createdAt&limit=200&depth=1`),
      api<Campaign>(`/api/campaigns/${campaign.id}?depth=0`),
    ])
    setRevisions(revRes.docs)
    setComments(commentRes.docs)
    setApprovals(approvalRes.docs)
    setActivity(activityRes.docs)
    setCampaign(campaignRes)
    setLastSync(new Date().toISOString())
    const newest = revRes.docs[0]
    const currentId = revisionIdRef.current
    const wasLatest = revisionsRef.current[0]?.id === currentId
    if (newest && currentId && wasLatest && newest.id !== currentId) {
      setRevisionId(newest.id)
      toast('New revision loaded')
    }
  }, [campaign.id])

  useEffect(() => {
    const handle = window.setInterval(() => {
      refresh().catch(() => undefined)
    }, POLL_MS)
    return () => window.clearInterval(handle)
  }, [refresh])

  function applyThemeToFrame(doc: Document) {
    let style = doc.getElementById('__qa_theme')
    if (!style) {
      style = doc.createElement('style')
      style.id = '__qa_theme'
      doc.head.appendChild(style)
    }
    const invert = doc.getElementById('__qa_invert')
    if (theme === 'dark') {
      style.textContent = ':root { color-scheme: dark; } html, body { background: transparent !important; }'
      let hasDarkCss = false
      for (const sheet of Array.from(doc.styleSheets || [])) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule instanceof CSSMediaRule && /prefers-color-scheme\s*:\s*dark/i.test(rule.media.mediaText)) {
              hasDarkCss = true
              try {
                rule.media.mediaText = 'all'
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }
      }
      if (!hasDarkCss) {
        let invertStyle = invert
        if (!invertStyle) {
          invertStyle = doc.createElement('style')
          invertStyle.id = '__qa_invert'
          doc.head.appendChild(invertStyle)
        }
        invertStyle.textContent = `
          html { filter: invert(1) hue-rotate(180deg) !important; background: #ffffff !important; }
          img, video, picture, svg, iframe, embed, object,
          [style*="background-image"], [style*="background:url"], [style*="background: url"] {
            filter: invert(1) hue-rotate(180deg) !important;
          }
        `
      } else if (invert) invert.remove()
    } else {
      style.textContent = ':root { color-scheme: light; }'
      invert?.remove()
    }
  }

  function onFrameLoad(viewport: 'mobile' | 'desktop') {
    const frame = viewport === 'mobile' ? mobileFrame.current : desktopFrame.current
    const doc = frame?.contentDocument
    if (!doc || !frame) return
    const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0, 200)
    frame.style.height = `${height}px`
    applyThemeToFrame(doc)
    doc.addEventListener(
      'click',
      (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!canWrite) return
        setPendingPin({ viewport, x: event.pageX, y: event.pageY })
        setCommentText('')
        setCommentCategory('')
        commentDialog.current?.showModal()
      },
      true,
    )
    doc.addEventListener('submit', (event) => event.preventDefault(), true)
    if (viewport === 'mobile') {
      setLinkAudit(auditLinks(doc))
      setQaChecks(runPreSendChecks(doc, htmlDraft || revision?.html || ''))
    }
  }

  useEffect(() => {
    ;[mobileFrame.current, desktopFrame.current].forEach((frame) => {
      if (frame?.contentDocument) applyThemeToFrame(frame.contentDocument)
    })
  }, [theme])

  async function saveCampaign(next: Partial<Campaign>) {
    if (!isAdmin) return null
    try {
      const updated = await api<Campaign>(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: JSON.stringify(next),
      })
      setCampaign(updated)
      return updated
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save campaign', 'error')
      return null
    }
  }

  async function toggleShipped() {
    if (!isAdmin) return
    const next = !campaign.shipped
    setShipping(true)
    try {
      const updated = await saveCampaign({ shipped: next })
      if (updated) toast(next ? 'Marked shipped' : 'Unmarked shipped')
    } finally {
      setShipping(false)
    }
  }

  async function createRevision(html: string, source: Revision['source'] = 'paste') {
    if (!isAdmin || !html.trim()) {
      toast('Paste some HTML first', 'error')
      return
    }
    setSavingRevision(true)
    try {
      const created = await api<Revision>('/api/revisions', {
        method: 'POST',
        body: JSON.stringify({
          campaign: campaign.id,
          html,
          preheader: extractPreheader(html),
          source,
        }),
      })
      if (!created?.id || typeof created.html !== 'string') {
        throw new Error('Revision was created but the server response was incomplete. Refresh the page.')
      }
      setRevisions((current) => [created, ...current.filter((item) => item.id !== created.id)])
      setRevisionId(created.id)
      setHtmlDraft(created.html)
      toast(`Revision ${created.number} saved`)
      await refresh().catch(() => undefined)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save revision', 'error')
    } finally {
      setSavingRevision(false)
    }
  }

  async function saveComment(event: React.FormEvent) {
    event.preventDefault()
    if (!pendingPin || !revision || !commentText.trim() || !canWrite) return
    await api<CommentDoc>('/api/comments', {
      method: 'POST',
      body: JSON.stringify({
        campaign: campaign.id,
        revision: revision.id,
        text: commentText.trim(),
        category: commentCategory || undefined,
        viewport: pendingPin.viewport,
        x: pendingPin.x,
        y: pendingPin.y,
      }),
    })
    commentDialog.current?.close()
    setPendingPin(null)
    toast('Comment pinned')
    await refresh()
  }

  async function addReply(commentId: string, text: string) {
    const comment = comments.find((item) => item.id === commentId)
    if (!comment || !text.trim()) return
    await api(`/api/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        replies: [
          ...(comment.replies || []).map((reply) => ({
            id: reply.id,
            author: userId(reply.author),
            text: reply.text,
            createdAt: reply.createdAt,
          })),
          { text: text.trim() },
        ],
      }),
    })
    setOpenPinId(commentId)
    await refresh()
  }

  async function toggleResolved(comment: CommentDoc) {
    await api(`/api/comments/${comment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: comment.status === 'open' ? 'resolved' : 'open' }),
    })
    toast(comment.status === 'open' ? 'Marked resolved' : 'Reopened')
    await refresh()
  }

  async function deleteComment(id: string) {
    await api(`/api/comments/${id}`, { method: 'DELETE' })
    toast('Comment removed')
    await refresh()
  }

  async function approve() {
    if (!revision || !canWrite) return
    await api('/api/approvals', {
      method: 'POST',
      body: JSON.stringify({ campaign: campaign.id, revision: revision.id }),
    })
    toast(`Approved as ${user.email}`)
    await refresh()
  }

  async function unapprove() {
    if (!myApproval) return
    await api(`/api/approvals/${myApproval.id}`, { method: 'DELETE' })
    toast('Approval removed')
    await refresh()
  }

  async function loadDesignStudio() {
    setDsLoading(true)
    try {
      const data = await api<{ configured: boolean; emails: DesignStudioListEmail[] }>(
        `/api/campaigns/design-studio${dsSearch ? `?search=${encodeURIComponent(dsSearch)}` : ''}`,
      )
      setDsConfigured(data.configured)
      setDsEmails(data.emails)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not load Design Studio', 'error')
    } finally {
      setDsLoading(false)
    }
  }

  async function importDesignStudio(emailId: string) {
    setDsLoading(true)
    try {
      await api(`/api/campaigns/${campaign.id}/import-design-studio`, {
        method: 'POST',
        body: JSON.stringify({ emailId }),
      })
      dsDialog.current?.close()
      setDsOpen(false)
      toast('Imported from Design Studio')
      await refresh()
      const revRes = await api<Paginated<Revision>>(
        `/api/revisions?where[campaign][equals]=${campaign.id}&sort=-number&limit=1&depth=0`,
      )
      if (revRes.docs[0]) setRevisionId(revRes.docs[0].id)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error')
    } finally {
      setDsLoading(false)
    }
  }

  async function deleteCampaign() {
    if (
      !window.confirm(
        `Delete “${campaign.title}”? This removes its HTML revisions, comments, and approvals.`,
      )
    ) {
      return
    }
    setDeletingCampaign(true)
    try {
      await api(`/api/campaigns/${campaign.id}`, { method: 'DELETE' })
      router.push('/')
      router.refresh()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete campaign', 'error')
      setDeletingCampaign(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(
      () => toast('Campaign link copied'),
      () => toast(window.location.href),
    )
  }

  function logout() {
    window.location.href = figmaLogoutUrl('/login', window.location.origin)
  }

  function exportActivityCsv() {
    if (activity.length === 0) {
      toast('No activity yet')
      return
    }
    const rows = [['timestamp', 'author', 'action', 'preview']]
    activity
      .slice()
      .reverse()
      .forEach((ev) => {
        rows.push([ev.createdAt || '', userEmail(ev.author), ev.type, ev.textPreview || ''])
      })
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `email-qa-activity-${campaign.slug}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportJson() {
    const mine = currentComments.filter((comment) => userId(comment.author) === user.id)
    const mineAppr = currentApprovals.filter((approval) => userId(approval.author) === user.id)
    const blob = new Blob(
      [
        JSON.stringify(
          {
            type: 'figma-email-qa-feedback',
            campaign: campaign.slug,
            revision: revision?.number,
            reviewer: user.email,
            exportedAt: new Date().toISOString(),
            comments: mine,
            approvals: mineAppr,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `email-qa-${user.email.split('@')[0]}-r${revision?.number || 0}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function scrollToPin(comment: CommentDoc) {
    const wrap = document.getElementById(`${comment.viewport}-wrap`)
    const previews = previewsRef.current
    if (!wrap || !previews) return
    const wrapRect = wrap.getBoundingClientRect()
    const previewsRect = previews.getBoundingClientRect()
    previews.scrollTo({
      top: Math.max(0, previews.scrollTop + (wrapRect.top - previewsRect.top) + comment.y - 120),
      behavior: 'smooth',
    })
    window.setTimeout(() => setOpenPinId(comment.id), 380)
  }

  function highlightLink(href: string) {
    ;(['mobile', 'desktop'] as const).forEach((viewport) => {
      const doc = (viewport === 'mobile' ? mobileFrame : desktopFrame).current?.contentDocument
      if (!doc) return
      doc.querySelectorAll('.link-highlight').forEach((el) => el.classList.remove('link-highlight'))
      const matches = Array.from(doc.querySelectorAll(`a[href="${href.replace(/"/g, '\\"')}"]`))
      matches.forEach((anchor) => {
        ;(anchor as HTMLElement).style.outline = '3px solid #4f46e5'
        anchor.classList.add('link-highlight')
      })
    })
    window.setTimeout(() => {
      ;(['mobile', 'desktop'] as const).forEach((viewport) => {
        const doc = (viewport === 'mobile' ? mobileFrame : desktopFrame).current?.contentDocument
        if (!doc) return
        doc.querySelectorAll('.link-highlight').forEach((el) => {
          ;(el as HTMLElement).style.outline = ''
          el.classList.remove('link-highlight')
        })
      })
    }, 3500)
  }

  const filteredComments = currentComments.filter((comment) => {
    if (commentFilter === 'open') return comment.status === 'open'
    if (commentFilter === 'resolved') return comment.status === 'resolved'
    return true
  })

  const openCount = currentComments.filter((comment) => comment.status === 'open').length
  const helperA = subjectHelper(campaign.subject)
  const helperB = subjectHelper(campaign.subjectB)
  const preheader = extractPreheader(htmlDraft || revision?.html || renderedHtml)
  const status = campaignStatus({
    shipped: campaign.shipped,
    hasRevision: Boolean(revision),
    approvalCount: currentApprovals.length,
    openComments: openCount,
  })

  function inboxLine(limit: number, preLimit: number) {
    const from = campaign.fromName || '(no from name)'
    const subject = campaign.subject || '(no subject)'
    const ab = Boolean(campaign.abEnabled && campaign.subjectB)
    const warnings: { cls: string; text: string }[] = []
    if (!campaign.subject) warnings.push({ cls: 'warn', text: 'No subject' })
    else if ((campaign.subject || '').length > limit) warnings.push({ cls: 'warn', text: `Subject ${campaign.subject.length}c · clipped at ~${limit}` })
    else warnings.push({ cls: 'ok', text: `Subject ${campaign.subject.length}c` })
    if (ab) {
      if (!campaign.subjectB) warnings.push({ cls: 'warn', text: 'Subject B empty' })
      else if (campaign.subjectB.length > limit) warnings.push({ cls: 'warn', text: `Subject B ${campaign.subjectB.length}c · clipped at ~${limit}` })
      else warnings.push({ cls: 'ok', text: `Subject B ${campaign.subjectB.length}c` })
    }
    if (!preheader) warnings.push({ cls: 'warn', text: 'No preheader detected' })
    else if (preheader.length > preLimit) warnings.push({ cls: 'warn', text: `Preheader ${preheader.length}c · clipped at ~${preLimit}` })
    else warnings.push({ cls: 'ok', text: `Preheader ${preheader.length}c` })

    return (
      <>
        <div className="ip-from-line">{from}</div>
        <div className="ip-subject-line">
          {ab ? <span className="ip-variant-tag">A</span> : null}
          <span className="ip-subject">{subject}</span>
        </div>
        {preheader ? <div className="ip-preheader">{preheader.slice(0, preLimit)}</div> : null}
        {ab ? (
          <>
            <div className="ip-subject-line">
              <span className="ip-variant-tag">B</span>
              <span className="ip-subject">{campaign.subjectB}</span>
            </div>
            {preheader ? <div className="ip-preheader">{preheader.slice(0, preLimit)}</div> : null}
          </>
        ) : null}
        <div className="ip-warnings">
          {warnings.map((warning) => (
            <span key={warning.text} className={`ip-warning ${warning.cls}`}>
              {warning.text}
            </span>
          ))}
        </div>
      </>
    )
  }

  function renderPin(comment: CommentDoc) {
    const author = userEmail(comment.author) || 'Unknown'
    const color = colorFor(author)
    const canDelete = userId(comment.author) === user.id || isAdmin
    return (
      <div
        key={comment.id}
        className={`pin${openPinId === comment.id ? ' open' : ''}${comment.status === 'resolved' ? ' resolved' : ''}`}
        data-id={comment.id}
        style={{ left: comment.x, top: comment.y, ['--pin-color' as string]: color }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('.pin-popover')) return
          event.stopPropagation()
          setOpenPinId((current) => (current === comment.id ? null : comment.id))
        }}
      >
        <div className="pin-bubble">
          <span>{initialOf(author)}</span>
        </div>
        <div className="pin-popover">
          <div className="pin-header">
            <div className="author">
              <span className="swatch" style={{ background: color }} />
              {author}
            </div>
            {comment.category ? <span className={`category-pill ${comment.category}`}>{comment.category}</span> : null}
            {comment.status === 'resolved' ? (
              <span className="status-pill resolved">Resolved</span>
            ) : null}
          </div>
          <div className="text">{comment.text}</div>
          <div className="meta">
            {formatDate(comment.createdAt)} · {comment.viewport}
          </div>
          {(comment.replies || []).length > 0 ? (
            <div className="pin-replies">
              {(comment.replies || []).map((reply, index) => (
                <div key={reply.id || index} className="pin-reply">
                  <div className="reply-head">
                    <span className="swatch" style={{ background: colorFor(userEmail(reply.author)) }} />
                    <span>{userEmail(reply.author)}</span>
                    <span className="ts-tag">{formatRelative(reply.createdAt)}</span>
                  </div>
                  <div>{reply.text}</div>
                </div>
              ))}
            </div>
          ) : null}
          {canWrite ? (
            <form
              className="reply-input-row"
              onSubmit={(event) => {
                event.preventDefault()
                const input = event.currentTarget.querySelector('input')
                if (input) {
                  addReply(comment.id, input.value)
                  input.value = ''
                }
              }}
            >
              <input className="reply-input" placeholder="Reply..." />
              <button className="primary" type="submit">
                Reply
              </button>
            </form>
          ) : null}
          <div className="pin-bottom-actions">
            <button className="ghost tiny" type="button" onClick={() => toggleResolved(comment)}>
              {comment.status === 'resolved' ? 'Reopen' : '✓ Mark resolved'}
            </button>
            {canDelete ? (
              <button className="ghost danger tiny" type="button" onClick={() => deleteComment(comment.id)}>
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="qa-app" onClick={() => setOpenPinId(null)}>
      <header className="qa-header">
        <h1>
          <Link href="/">
            <Logo /> Email QA
          </Link>
        </h1>
        <div className="h-divider" />
        <div className="group">
          <label htmlFor="project-name">Campaign</label>
          <input
            id="project-name"
            value={campaign.title}
            disabled={!isAdmin}
            onChange={(e) => setCampaign({ ...campaign, title: e.target.value })}
            onBlur={(e) => saveCampaign({ title: e.target.value })}
          />
        </div>
        {revisions.length > 0 ? (
          <>
            <div className="h-divider" />
            <div className="group">
              <label htmlFor="revision">Revision</label>
              <select
                id="revision"
                value={revision?.id || ''}
                onChange={(e) => setRevisionId(e.target.value)}
              >
                {revisions.map((item) => (
                  <option key={item.id} value={item.id}>
                    v{item.number}
                    {item.id === latest?.id ? ' · latest' : ''}
                    {item.source === 'design-studio' ? ' · Design Studio' : ''}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}
        <div className="spacer" />
        <span className={`status-badge ${status.cls}`}>{status.text}</span>
        <span className="status-badge">{openCount} open</span>
        {isAdmin ? (
          <button className="tiny" type="button" disabled={shipping} onClick={toggleShipped}>
            {shipping ? 'Updating…' : campaign.shipped ? 'Unmark shipped' : 'Mark shipped'}
          </button>
        ) : null}
        <span className="you-chip">{user.email}</span>
        <div className="theme-toggle">
          <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
            Light
          </button>
          <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
            Dark
          </button>
        </div>
        <button className="ghost tiny" type="button" onClick={logout}>
          Log out
        </button>
      </header>

      <main className="qa-main">
        <aside className="qa-aside" onClick={(e) => e.stopPropagation()}>
          <div className="panel">
            <div className="panel-head">
              <h2>Share for stakeholder review</h2>
            </div>
            <div className="share-row">
              <div className={`sync-dot ${lastSync ? 'connected' : ''}`} />
              <div className="meta">
                Logged in · {lastSync ? `synced ${formatRelative(lastSync)}` : 'live'}
              </div>
              <button className="tiny" type="button" onClick={copyLink}>
                Copy link
              </button>
            </div>
            <p className="legend">Anyone at Figma with this URL can open the campaign while signed in.</p>
            <div className="btn-row">
              <Link className="ghost" href="/">
                📁 All campaigns
              </Link>
              {isAdmin ? (
                <button
                  className="ghost danger tiny"
                  type="button"
                  disabled={deletingCampaign}
                  onClick={deleteCampaign}
                >
                  {deletingCampaign ? 'Deleting…' : 'Delete campaign'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Inbox info</h2>
            </div>
            <div className="field">
              <label htmlFor="from-name">From name</label>
              <input
                id="from-name"
                value={campaign.fromName || ''}
                disabled={!isAdmin}
                onChange={(e) => setCampaign({ ...campaign, fromName: e.target.value })}
                onBlur={(e) => saveCampaign({ fromName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="subject-line">Subject line{campaign.abEnabled ? ' (A)' : ''}</label>
              <input
                id="subject-line"
                value={campaign.subject || ''}
                disabled={!isAdmin}
                onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })}
                onBlur={(e) => saveCampaign({ subject: e.target.value })}
              />
              <div className={helperA.cls}>{helperA.msg}</div>
            </div>
            {campaign.abEnabled ? (
              <div className="field">
                <label htmlFor="subject-b">Subject line B</label>
                <input
                  id="subject-b"
                  value={campaign.subjectB || ''}
                  disabled={!isAdmin}
                  onChange={(e) => setCampaign({ ...campaign, subjectB: e.target.value })}
                  onBlur={(e) => saveCampaign({ subjectB: e.target.value })}
                />
                <div className={helperB.cls}>{helperB.msg}</div>
              </div>
            ) : null}
            {isAdmin ? (
              <div className="btn-row">
                <button
                  className="ghost tiny"
                  type="button"
                  onClick={() => saveCampaign({ abEnabled: !campaign.abEnabled, subjectB: campaign.abEnabled ? '' : campaign.subjectB })}
                >
                  {campaign.abEnabled ? 'Remove A/B variant' : '+ Add A/B subject variant'}
                </button>
              </div>
            ) : null}
            <p className="legend">Preheader is read from the email HTML and shown in the inbox previews.</p>
          </div>

          {isAdmin ? (
            <div className="panel">
              <details open={!revision}>
                <summary>
                  <strong style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--text-faint)' }}>
                    EMAIL SOURCE
                  </strong>
                </summary>
                <textarea
                  className="html-input"
                  value={htmlDraft}
                  onChange={(e) => setHtmlDraft(e.target.value)}
                  placeholder="<!doctype html><html>..."
                  spellCheck={false}
                />
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button
                    className="primary"
                    type="button"
                    disabled={savingRevision}
                    onClick={() => createRevision(htmlDraft, 'paste')}
                  >
                    {savingRevision ? 'Saving…' : 'Save as new revision'}
                  </button>
                  <button type="button" disabled={savingRevision} onClick={() => createRevision(SAMPLE_EMAIL, 'sample')}>
                    Load sample
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDsOpen(true)
                      dsDialog.current?.showModal()
                      loadDesignStudio()
                    }}
                  >
                    Import from Design Studio
                  </button>
                </div>
              </details>
            </div>
          ) : null}

          {liquid.inputs.length + liquid.customTags.length > 0 ? (
            <div className="panel">
              <div className="panel-head">
                <h2>Personalization ({liquid.inputs.length + liquid.customTags.length})</h2>
              </div>
              <p className="legend">Liquid template detected. Fill in values to render one version.</p>
              <ul className="list">
                {liquid.inputs.map((input) => (
                  <li key={input.name} className="personalization-input">
                    <label className="field-label">{input.name}</label>
                    <input
                      value={personalizationValues[input.name] || ''}
                      onChange={(e) =>
                        setPersonalizationValues((current) => ({ ...current, [input.name]: e.target.value }))
                      }
                    />
                    {input.contexts[0] ? <div className="helper">{input.contexts[0]}</div> : null}
                  </li>
                ))}
              </ul>
              {liquid.customTags.map((tag) => (
                <div key={tag} className="personalization-input">
                  <label className="field-label">{`{% ${tag} %}`}</label>
                  <input
                    value={espStubs[tag] || ''}
                    onChange={(e) => setEspStubs((current) => ({ ...current, [tag]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="btn-row">
                <button className="primary" type="button" onClick={applyRender}>
                  Apply & re-render
                </button>
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-head">
              <h2>Approvals {currentApprovals.length ? `(${currentApprovals.length})` : ''}</h2>
            </div>
            {canWrite ? (
              myApproval ? (
                <div>
                  <div className="approved-banner">You approved {formatRelative(myApproval.createdAt)}</div>
                  <button className="ghost" type="button" onClick={unapprove} style={{ marginTop: 6 }}>
                    Withdraw approval
                  </button>
                </div>
              ) : (
                <button className="success" type="button" onClick={approve} style={{ width: '100%' }}>
                  ✓ Approve this email
                </button>
              )
            ) : (
              <p className="legend">Approvals are only collected on the latest revision.</p>
            )}
            {currentApprovals.length === 0 ? (
              <div className="empty">No approvals yet.</div>
            ) : (
              <ul className="list">
                {currentApprovals.map((approval) => (
                  <li key={approval.id}>
                    <div className="author-line">
                      <span className="swatch" style={{ background: colorFor(userEmail(approval.author)) }} />
                      <span>{userEmail(approval.author)}</span>
                      <span className="ts-tag">{formatRelative(approval.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {stillOpen.length > 0 && isLatest ? (
            <div className="panel">
              <div className="panel-head">
                <h2>Still open from earlier revisions ({stillOpen.length})</h2>
              </div>
              <p className="legend">These comments stayed open when new HTML was added. They are not pinned on this version.</p>
              <ul className="list">
                {stillOpen.map((comment) => (
                  <li key={comment.id}>
                    <div className="author-line">
                      <span className="swatch" style={{ background: colorFor(userEmail(comment.author)) }} />
                      <span>{userEmail(comment.author)}</span>
                      <span className="vp-tag">
                        v{typeof comment.revision === 'object' ? comment.revision.number : ''}
                      </span>
                    </div>
                    <div>{comment.text}</div>
                    <button className="ghost tiny" type="button" onClick={() => toggleResolved(comment)}>
                      Mark resolved
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-head">
              <h2>Comments {currentComments.length ? `(${openCount} open)` : ''}</h2>
            </div>
            <div className="comment-filter-row">
              {(['open', 'resolved', 'all'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={commentFilter === filter ? 'active' : ''}
                  onClick={() => setCommentFilter(filter)}
                >
                  {filter[0].toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
            {filteredComments.length === 0 ? (
              <div className="empty">
                {canWrite ? 'Click anywhere on the email to leave a comment.' : 'No comments on this revision.'}
              </div>
            ) : (
              <ul className="list comments-list">
                {filteredComments.map((comment) => (
                  <li
                    key={comment.id}
                    className={`clickable${comment.status === 'resolved' ? ' resolved' : ''}`}
                    onClick={() => scrollToPin(comment)}
                  >
                    <div className="author-line">
                      <span className="swatch" style={{ background: colorFor(userEmail(comment.author)) }} />
                      <span>{userEmail(comment.author)}</span>
                      {comment.category ? <span className={`category-pill ${comment.category}`}>{comment.category}</span> : null}
                      <span className="vp-tag">{comment.viewport}</span>
                    </div>
                    <div>{comment.text}</div>
                    {(comment.replies || []).length ? (
                      <div className="reply-count">
                        {comment.replies?.length} {(comment.replies?.length || 0) === 1 ? 'reply' : 'replies'}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <details>
              <summary>
                <strong style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--text-faint)' }}>
                  ACTIVITY LOG
                </strong>
                {activity.length ? <span className="legend"> ({activity.length})</span> : null}
              </summary>
              {activity.length === 0 ? (
                <div className="empty">No activity yet.</div>
              ) : (
                <ul className="list" style={{ marginTop: 6 }}>
                  {activity.map((ev) => (
                    <li key={ev.id}>
                      <div className="author-line">
                        <span className="swatch" style={{ background: colorFor(userEmail(ev.author)) }} />
                        <span>{userEmail(ev.author)}</span>
                        <span className="ts-tag">{formatRelative(ev.createdAt)}</span>
                      </div>
                      <div>{describeEvent(ev)}</div>
                      {ev.textPreview ? (
                        <div className="legend" style={{ fontStyle: 'italic' }}>
                          “{escapeHtml(ev.textPreview)}”
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <button className="ghost tiny" type="button" onClick={exportActivityCsv}>
                Download as CSV
              </button>
            </details>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>QA checks</h2>
            </div>
            <details>
              <summary>Pre-send checklist</summary>
              <ul className="list" style={{ marginTop: 6 }}>
                {qaChecks.map((check) => (
                  <li key={check.title} className="qa-item">
                    <span className={`qa-icon ${check.cls}`}>
                      {check.cls === 'pass' ? '✓' : check.cls === 'warn' ? '!' : check.cls === 'fail' ? '✕' : 'i'}
                    </span>
                    <div className="qa-text">
                      <strong>{check.title}</strong>
                      <div className="desc">{check.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
            <details>
              <summary>Link audit {linkAudit.length ? `(${linkAudit.length})` : ''}</summary>
              <ul className="list" style={{ marginTop: 6 }}>
                {linkAudit.map((item) => (
                  <li key={item.href} className="link-item clickable" onClick={() => highlightLink(item.href)}>
                    <div className="href">{item.href}</div>
                    <div className="issues">
                      {item.issues.map((issue) => (
                        <span key={issue.text} className={`link-tag ${issue.cls}`}>
                          {issue.text}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          </div>

          <div className="panel">
            <details>
              <summary>
                <strong style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--text-faint)' }}>
                  OFFLINE BACKUP
                </strong>
              </summary>
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button type="button" onClick={exportJson}>
                  Export JSON
                </button>
              </div>
            </details>
          </div>
        </aside>

        <section className={`previews${theme === 'dark' ? ' dark' : ''}`} id="previews" ref={previewsRef}>
          {!isLatest && revision ? (
            <div className="readonly-banner">
              Viewing revision {revision.number} of {latest?.number}. Comments and approvals are read-only. Switch to
              latest to leave new feedback.
            </div>
          ) : null}
          <div className="frames">
            {(['mobile', 'desktop'] as const).map((viewport) => (
              <div key={viewport} className={`preview ${viewport}`}>
                <div className="preview-label">{viewport === 'mobile' ? 'Mobile · 375px' : 'Desktop · 600px'}</div>
                <div className="ip-card">
                  <div className="ip-meta">
                    {viewport === 'mobile'
                      ? 'Gmail mobile inbox · ~35 char subject, ~80 char preheader'
                      : 'Gmail web inbox · ~70 char subject, ~120 char preheader'}
                  </div>
                  {inboxLine(viewport === 'mobile' ? 35 : 70, viewport === 'mobile' ? 80 : 120)}
                </div>
                <div className="frame-wrap" id={`${viewport}-wrap`}>
                  {renderedHtml ? (
                    <>
                      <iframe
                        key={`${revision?.id || 'none'}-${viewport}-${theme}-${hashString(renderedHtml)}`}
                        ref={viewport === 'mobile' ? mobileFrame : desktopFrame}
                        title={`${viewport} preview`}
                        srcDoc={wrapHtml(renderedHtml)}
                        onLoad={() => onFrameLoad(viewport)}
                      />
                      <div className="pins" data-viewport={viewport}>
                        {currentComments.filter((comment) => comment.viewport === viewport).map(renderPin)}
                      </div>
                    </>
                  ) : (
                    <div className="frame-empty">
                      {isAdmin ? 'Import from Design Studio or paste HTML to start QA' : 'This campaign does not have an email yet'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <dialog ref={commentDialog} id="comment-dialog" className="qa-dialog">
        <div className="title">New comment</div>
        <div className="sub">
          Pinning on {pendingPin?.viewport} preview as {user.email}
        </div>
        <form onSubmit={saveComment}>
          <div className="field">
            <label htmlFor="comment-category">Category (optional)</label>
            <select id="comment-category" value={commentCategory} onChange={(e) => setCommentCategory(e.target.value)}>
              <option value="">No category</option>
              <option value="copy">Copy</option>
              <option value="design">Design</option>
              <option value="bug">Bug</option>
              <option value="question">Question</option>
            </select>
          </div>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="What needs attention here?"
            required
          />
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                setPendingPin(null)
                commentDialog.current?.close()
              }}
            >
              Cancel
            </button>
            <button className="primary" type="submit">
              Pin comment
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={dsDialog} className="qa-dialog wide">
        <div className="title">Import from Design Studio</div>
        <div className="sub">
          Pull the current HTML for a Design Studio email into a new revision. This does not write back to Customer.io.
        </div>
        {!dsConfigured ? (
          <div className="empty">Set CUSTOMERIO_APP_API_KEY on the server to enable import.</div>
        ) : (
          <>
            <input
              type="search"
              placeholder="Search emails…"
              value={dsSearch}
              onChange={(e) => setDsSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadDesignStudio()
              }}
              style={{ width: '100%', marginBottom: 12 }}
            />
            {dsLoading ? <div className="empty">Loading…</div> : null}
            <div className="campaigns-list">
              {dsEmails
                .filter((email) => {
                  const q = dsSearch.toLowerCase()
                  return !q || email.name.toLowerCase().includes(q) || (email.subject || '').toLowerCase().includes(q)
                })
                .map((email) => (
                  <button
                    key={email.id}
                    className="campaign-row ds-row"
                    type="button"
                    disabled={dsLoading}
                    onClick={() => importDesignStudio(email.id)}
                  >
                    <div>
                      <div className="name">{email.name}</div>
                      <div className="subject">{email.subject || '(no subject)'}</div>
                    </div>
                    <span className="tiny">Import</span>
                  </button>
                ))}
            </div>
          </>
        )}
        <div className="actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => {
              dsDialog.current?.close()
              setDsOpen(false)
            }}
          >
            Close
          </button>
        </div>
      </dialog>

      <div className="toast" id="toast" />
    </div>
  )
}
