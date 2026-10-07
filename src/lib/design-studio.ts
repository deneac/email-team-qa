import { APIError } from 'payload'

export type DesignStudioEmailSummary = {
  id: string
  name: string
  subject?: string
  isTemplate?: boolean
  updatedAt?: string
}

export type DesignStudioEmailDetail = DesignStudioEmailSummary & {
  html: string
  preheader?: string
  fromName?: string
}

type CioEmail = {
  id?: string
  name?: string
  is_template?: boolean
  updated_at?: string
  content?: {
    subject?: string
    preheader_text?: string
    html?: string
  }
  envelope?: {
    from?: string
    from_name?: string
  }
}

function appApiBase(): string {
  return (process.env.CUSTOMERIO_APP_API_URL || 'https://api.customer.io').replace(/\/$/, '')
}

function appApiKey(): string {
  const key = process.env.CUSTOMERIO_APP_API_KEY
  if (!key) {
    throw new APIError(
      'Design Studio import is not configured. Set CUSTOMERIO_APP_API_KEY on the server.',
      501,
    )
  }
  return key
}

async function cioFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${appApiBase()}${path}`, {
    headers: {
      Authorization: `Bearer ${appApiKey()}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new APIError(
      `Customer.io request failed (${res.status})${body ? `: ${body.slice(0, 180)}` : ''}`,
      res.status === 401 || res.status === 403 ? 502 : 502,
    )
  }

  return (await res.json()) as T
}

function mapSummary(email: CioEmail): DesignStudioEmailSummary {
  return {
    id: String(email.id || ''),
    name: email.name || 'Untitled email',
    subject: email.content?.subject,
    isTemplate: email.is_template,
    updatedAt: email.updated_at,
  }
}

export async function listDesignStudioEmailsFromCio(
  search?: string,
): Promise<DesignStudioEmailSummary[]> {
  const data = await cioFetch<{ emails?: CioEmail[] }>(
    '/v1/design_studio/emails?limit=100',
  )
  const emails = (data.emails || []).map(mapSummary).filter((email) => email.id)
  if (!search) return emails
  const q = search.toLowerCase()
  return emails.filter(
    (email) =>
      email.name.toLowerCase().includes(q) ||
      (email.subject || '').toLowerCase().includes(q),
  )
}

export async function getDesignStudioEmailFromCio(
  id: string,
): Promise<DesignStudioEmailDetail> {
  const data = await cioFetch<{ email?: CioEmail }>(`/v1/design_studio/emails/${id}`)
  const email = data.email
  if (!email) {
    throw new APIError('Design Studio email not found', 404)
  }

  const html = email.content?.html || ''
  if (!html.trim()) {
    throw new APIError(
      'That Design Studio email has no HTML yet. Publish or add body content in Customer.io first.',
      400,
    )
  }

  return {
    ...mapSummary(email),
    html,
    preheader: email.content?.preheader_text,
    fromName: email.envelope?.from_name || email.envelope?.from,
  }
}

export function isDesignStudioConfigured(): boolean {
  return Boolean(process.env.CUSTOMERIO_APP_API_KEY)
}
