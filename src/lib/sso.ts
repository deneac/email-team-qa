export function safeInternalPath(value?: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export function absoluteAppUrl(path: string, origin: string): string {
  return new URL(safeInternalPath(path), origin).href
}

export function figmaMetaUrl(redirectTo?: string | null, origin?: string): string {
  const params = new URLSearchParams()
  if (origin) {
    params.set('serverURL', origin)
    // Figma's /sso/login callback rejects relative paths with
    // "Invalid redirect provided" — it requires an absolute http(s) URL.
    params.set('redirect', absoluteAppUrl(redirectTo ?? '/', origin))
    params.set('failedRedirect', absoluteAppUrl('/login', origin))
  }
  return `/api/users/sso/meta?${params.toString()}`
}

export function figmaLogoutUrl(redirectTo = '/login', origin?: string): string {
  const dest = origin ? absoluteAppUrl(redirectTo, origin) : safeInternalPath(redirectTo)
  return `/api/users/sso/logout?redirect=${encodeURIComponent(dest)}`
}
