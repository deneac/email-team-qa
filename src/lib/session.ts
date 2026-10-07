import { headers as getHeaders } from 'next/headers.js'
import { redirect } from 'next/navigation'
import { getPayload, type Payload } from 'payload'

import { safeInternalPath } from '@/lib/sso'
import type { SessionUser } from '@/lib/types'
import type { User } from '@/payload-types'
import config from '@payload-config'

export async function getPayloadClient(): Promise<Payload> {
  return getPayload({ config })
}

export async function requireAuth(
  returnTo = '/',
): Promise<{ payload: Payload; user: User; session: SessionUser }> {
  const headers = await getHeaders()
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers })
  if (!user || !('email' in user) || !user.email) {
    redirect(`/login?redirect=${encodeURIComponent(safeInternalPath(returnTo))}`)
  }

  return {
    payload,
    user,
    session: {
      id: String(user.id),
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'reviewer',
    },
  }
}
