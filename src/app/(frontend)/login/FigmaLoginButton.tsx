'use client'

import { useState } from 'react'

import { absoluteAppUrl, figmaMetaUrl } from '@/lib/sso'

export function FigmaLoginButton({ redirectTo }: { redirectTo: string }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function startLogin() {
    setError('')
    setPending(true)
    try {
      const origin = window.location.origin
      const destination = absoluteAppUrl(redirectTo, origin)
      document.cookie = `payloadRedirect=${destination}; path=/; Secure; SameSite=None; Partitioned`
      const res = await fetch(figmaMetaUrl(redirectTo, origin))
      const data = (await res.json().catch(() => ({}))) as { authorizeURL?: string; error?: string }
      if (!res.ok || !data.authorizeURL) {
        throw new Error(
          data.error ||
            'Figma sign-in is not configured yet. Run `npx @payloadcms/figma init` and restart the app.',
        )
      }
      window.location.href = data.authorizeURL
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Figma sign-in')
      setPending(false)
    }
  }

  return (
    <div>
      <button className="primary" type="button" onClick={startLogin} disabled={pending} style={{ width: '100%' }}>
        {pending ? 'Redirecting to Figma…' : 'Continue with Figma'}
      </button>
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  )
}
