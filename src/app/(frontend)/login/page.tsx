import { headers as getHeaders } from 'next/headers.js'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { Logo } from '@/components/Logo'
import { safeInternalPath } from '@/lib/sso'
import config from '@payload-config'

import { FigmaLoginButton } from './FigmaLoginButton'

type Args = { searchParams: Promise<{ redirect?: string }> }

export default async function LoginPage({ searchParams }: Args) {
  const { redirect: next } = await searchParams
  const destination = safeInternalPath(next)
  const headers = await getHeaders()
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers })
  if (user) redirect(destination)

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>
          <Logo /> Email QA
        </h1>
        <p>Sign in with your Figma account. You will use the same Okta prompt as the rest of Figma.</p>
        <FigmaLoginButton redirectTo={destination} />
        <p className="legend" style={{ marginTop: 16 }}>
          Email team members can manage users and roles in the <a href="/admin">admin panel</a>.
        </p>
      </div>
    </div>
  )
}
