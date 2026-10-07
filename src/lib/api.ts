function payloadErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const body = data as {
    error?: string
    errors?: Array<{
      data?: { errors?: Array<{ message?: string; path?: string }> }
      message?: string
    }>
    message?: string
  }
  const nested = body.errors?.[0]?.data?.errors?.[0]
  if (nested?.message) {
    return nested.path ? `${nested.path}: ${nested.message}` : nested.message
  }
  return body.errors?.[0]?.message || body.message || body.error || fallback
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payloadErrorMessage(data, res.statusText || 'Request failed'))
  }
  // Payload REST create/update/delete wrap the document as `{ doc, message }`.
  if (data && typeof data === 'object' && 'doc' in data && data.doc != null) {
    return data.doc as T
  }
  return data as T
}

export function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') search.set(key, String(value))
  })
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}
