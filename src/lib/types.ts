export type UserRole = 'admin' | 'reviewer'

export type SessionUser = {
  id: string
  email: string
  role: UserRole
}

export type Campaign = {
  id: string
  title: string
  slug: string
  fromName?: string | null
  subject?: string | null
  subjectB?: string | null
  abEnabled?: boolean | null
  latestRevision?: string | Revision | null
  designStudioEmailId?: string | null
  shipped?: boolean | null
  openComments?: number
  approvalCount?: number
  hasRevision?: boolean
  updatedAt?: string
  createdAt?: string
}

export type Revision = {
  id: string
  campaign: string | Campaign
  number: number
  html: string
  htmlHash?: string | null
  preheader?: string | null
  source?: 'paste' | 'design-studio' | 'sample' | null
  designStudioEmailId?: string | null
  designStudioName?: string | null
  personalization?: {
    values?: Record<string, string>
    espStubs?: Record<string, string>
  } | null
  createdAt?: string
}

export type CommentReply = {
  id?: string
  author: string | { id: string; email?: string }
  text: string
  createdAt?: string
}

export type CommentDoc = {
  id: string
  campaign: string | Campaign
  revision: string | Revision
  author: string | { id: string; email?: string }
  text: string
  category?: 'copy' | 'design' | 'bug' | 'question' | null
  status: 'open' | 'resolved'
  statusUpdatedAt?: string | null
  statusUpdatedBy?: string | { id: string; email?: string } | null
  viewport: 'mobile' | 'desktop'
  x: number
  y: number
  replies?: CommentReply[]
  createdAt?: string
  updatedAt?: string
}

export type ApprovalDoc = {
  id: string
  campaign: string
  revision: string
  author: string | { id: string; email?: string }
  createdAt?: string
}

export type ActivityDoc = {
  id: string
  type: string
  author: string | { id: string; email?: string }
  viewport?: string | null
  category?: string | null
  textPreview?: string | null
  createdAt?: string
}

export type DesignStudioListEmail = {
  id: string
  name: string
  subject?: string
  isTemplate?: boolean
  updatedAt?: string
}

export type Paginated<T> = {
  docs: T[]
  totalDocs: number
}
