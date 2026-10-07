export function wrapHtml(html: string): string {
  if (/<!doctype/i.test(html)) return html
  return (
    '<!doctype html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    `<body>${html}</body></html>`
  )
}

const PREHEADER_MAX = 250

function cleanPreheaderText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#847;|&#8203;|&#x200[bcd];|&#xFEFF;/gi, '')
    .replace(/[\u200b\u200c\u200d\u2060\uFEFF\u034F\u00ad]/g, '')
    .replace(/\u00a0|&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isPreheaderClass(value?: string | null): boolean {
  return /preheader|preview-text|preview_text/i.test(value || '')
}

function isHiddenPreheaderStyle(style: string): boolean {
  const s = style.toLowerCase()
  return (
    /display\s*:\s*none/.test(s) ||
    /visibility\s*:\s*hidden/.test(s) ||
    /font-size\s*:\s*0/.test(s) ||
    /font-size\s*:\s*1px/.test(s) ||
    /max-height\s*:\s*0/.test(s) ||
    /max-width\s*:\s*0/.test(s) ||
    /line-height\s*:\s*0/.test(s) ||
    /line-height\s*:\s*1px/.test(s) ||
    /opacity\s*:\s*0(\D|$)/.test(s) ||
    /mso-hide\s*:\s*all/.test(s) ||
    (/overflow\s*:\s*hidden/.test(s) && /height\s*:\s*0/.test(s))
  )
}

function pickBestPreheader(candidates: string[]): string {
  const usable = candidates
    .map(cleanPreheaderText)
    .filter((text) => text.length >= 4 && text.length <= PREHEADER_MAX)
  if (usable.length === 0) return ''
  const likely = usable.filter((text) => text.length >= 8 && text.length <= 160)
  const pool = likely.length > 0 ? likely : usable
  return pool.sort((a, b) => a.length - b.length)[0]
}

export function extractPreheader(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      if (doc?.body) {
        const labeled: string[] = []
        const hidden: string[] = []
        for (const el of Array.from(doc.body.querySelectorAll('*')).slice(0, 200)) {
          const text = el.textContent || ''
          if (!cleanPreheaderText(text)) continue
          const style = el.getAttribute('style') || ''
          if (isPreheaderClass(el.getAttribute('class'))) labeled.push(text)
          else if (el.getAttribute('hidden') !== null || isHiddenPreheaderStyle(style)) hidden.push(text)
        }
        const picked = pickBestPreheader(labeled) || pickBestPreheader(hidden)
        if (picked) return picked
      }
    } catch {
      // fall through to regex
    }
  }

  const labeled = html.match(
    /<(?:span|div|p|td)[^>]*class=["'][^"']*(?:preheader|preview-text|preview_text)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p|td)>/i,
  )
  if (labeled?.[1]) {
    const text = cleanPreheaderText(labeled[1])
    if (text.length >= 4) return text.slice(0, PREHEADER_MAX)
  }

  const hidden = html.match(
    /<(?:span|div|p|td)[^>]*(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all|font-size\s*:\s*1px|max-height\s*:\s*0)[^>]*>([\s\S]*?)<\/(?:span|div|p|td)>/i,
  )
  return hidden?.[1] ? cleanPreheaderText(hidden[1]).slice(0, PREHEADER_MAX) : ''
}

export function colorFor(name: string): string {
  if (!name) return '#9ca3af'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360}, 62%, 48%)`
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    return (
      {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char] || char
    )
  })
}

export function initialOf(name: string): string {
  return (name || '?').trim().slice(0, 1).toUpperCase()
}

export function formatDate(iso?: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return ''
  try {
    const ms = Date.now() - new Date(iso).getTime()
    if (ms < 60000) return 'just now'
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`
    if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`
    return `${Math.floor(ms / 86400000)}d ago`
  } catch {
    return iso
  }
}

export function userEmail(value: unknown): string {
  if (value && typeof value === 'object' && 'email' in value && typeof value.email === 'string') {
    return value.email
  }
  return ''
}

export function userId(value: unknown): string {
  if (value && typeof value === 'object' && 'id' in value) {
    return String(value.id)
  }
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

export type LinkIssue = { cls: 'danger' | 'warn' | 'info'; text: string }
export type LinkAuditItem = { href: string; count: number; issues: LinkIssue[] }

export function auditLinks(doc: Document): LinkAuditItem[] {
  const links = Array.from(doc.querySelectorAll('a[href]'))
  const seen = new Map<string, number>()
  links.forEach((anchor) => {
    const href = anchor.getAttribute('href') || ''
    seen.set(href, (seen.get(href) || 0) + 1)
  })

  return Array.from(seen.entries())
    .map(([href, count]) => {
      const issues: LinkIssue[] = []
      if (href.startsWith('http://')) issues.push({ cls: 'danger', text: 'HTTP (insecure)' })
      if (/^#/.test(href)) issues.push({ cls: 'warn', text: 'Anchor / placeholder' })
      if (/localhost|127\.0\.0\.1|\.local|\.test/.test(href)) {
        issues.push({ cls: 'danger', text: 'Localhost / test domain' })
      }
      if (/^mailto:/.test(href)) issues.push({ cls: 'info', text: 'Mailto' })
      if (/^tel:/.test(href)) issues.push({ cls: 'info', text: 'Tel' })
      if (href.startsWith('http') && !/utm_/.test(href) && !/^mailto:/.test(href)) {
        issues.push({ cls: 'warn', text: 'No UTM params' })
      }
      if (count > 1) issues.push({ cls: 'info', text: `Appears ${count}×` })
      return { href, count, issues }
    })
    .sort((a, b) => {
      const severity = (item: LinkAuditItem) =>
        item.issues.some((issue) => issue.cls === 'danger')
          ? 0
          : item.issues.some((issue) => issue.cls === 'warn')
            ? 1
            : 2
      return severity(a) - severity(b)
    })
}

export type QaCheck = { cls: 'pass' | 'warn' | 'fail' | 'info'; title: string; desc: string }

export function runPreSendChecks(doc: Document, emailHtml: string): QaCheck[] {
  const checks: QaCheck[] = []
  const sizeBytes = new Blob([emailHtml]).size
  const kb = (sizeBytes / 1024).toFixed(1)

  if (sizeBytes > 102 * 1024) {
    checks.push({
      cls: 'fail',
      title: `HTML is ${kb} KB`,
      desc: "Gmail clips emails above 102 KB. Slim down inline CSS or move content out.",
    })
  } else if (sizeBytes > 80 * 1024) {
    checks.push({
      cls: 'warn',
      title: `HTML is ${kb} KB`,
      desc: "Close to Gmail's 102 KB clip threshold — consider trimming.",
    })
  } else {
    checks.push({
      cls: 'pass',
      title: `HTML is ${kb} KB`,
      desc: "Well under Gmail's 102 KB clip threshold.",
    })
  }

  const imgs = Array.from(doc.querySelectorAll('img'))
  if (imgs.length === 0) {
    checks.push({ cls: 'info', title: 'No images', desc: 'No <img> tags found.' })
  } else {
    const missing = imgs.filter((img) => !img.getAttribute('alt'))
    if (missing.length === 0) {
      checks.push({
        cls: 'pass',
        title: `Alt text on ${imgs.length}/${imgs.length} images`,
        desc: 'All images have alt attributes.',
      })
    } else {
      checks.push({
        cls: 'warn',
        title: `Alt text missing on ${missing.length}/${imgs.length}`,
        desc: 'Add alt text — many subscribers have images blocked by default.',
      })
    }
  }

  const unsubRegex = /(unsubscribe|opt[\s-]?out|email[\s-]?preference|manage[\s-]?preferences)/i
  const hasUnsub = Array.from(doc.querySelectorAll('a')).some(
    (anchor) =>
      unsubRegex.test(anchor.textContent || '') || unsubRegex.test(anchor.getAttribute('href') || ''),
  )
  if (hasUnsub) {
    checks.push({
      cls: 'pass',
      title: 'Unsubscribe link present',
      desc: 'Found an unsubscribe / preferences link.',
    })
  } else {
    checks.push({
      cls: 'fail',
      title: 'No unsubscribe link found',
      desc: 'Required by CAN-SPAM and most ESPs.',
    })
  }

  const textRatio = (doc.body.textContent || '').trim().length / Math.max(1, emailHtml.length)
  if (textRatio < 0.05) {
    checks.push({
      cls: 'warn',
      title: 'Very little plain text',
      desc: 'Mostly markup — may trip spam filters that look for text/image balance.',
    })
  } else {
    checks.push({
      cls: 'pass',
      title: 'Has plain text content',
      desc: 'Text-to-markup ratio looks healthy.',
    })
  }

  return checks
}
