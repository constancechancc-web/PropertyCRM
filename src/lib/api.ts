export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code)
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network')
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string }
    throw new ApiError(res.status, d.error ?? 'error', d.message)
  }
  return data as T
}
