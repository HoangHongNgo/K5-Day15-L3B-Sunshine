import { ApiError } from '../wayfinder/wayfinderApi'

export type OrganizerAccount = {
  id: string
  username: string
  displayName: string
  clubName: string
  role: 'admin_truong' | 'clb'
}

export type AuthResponse = {
  ok: boolean
  account: OrganizerAccount
  token: string
}

export type AuthMeResponse = {
  authenticated: boolean
  account: OrganizerAccount | null
}

export type RegisterInput = {
  username: string
  password: string
  displayName: string
  clubName: string
}

export const AUTH_TOKEN_KEY = 'vinuni-wayfinder.btc.token.v1'

export function getStoredAuthToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_TOKEN_KEY)
    return raw && raw.trim() ? raw.trim() : null
  } catch {
    return null
  }
}

export function setStoredAuthToken(token: string | null): void {
  try {
    if (token && token.trim()) {
      localStorage.setItem(AUTH_TOKEN_KEY, token.trim())
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    /* ignore restricted storage */
  }
}

export function authHeaders(token?: string | null): Record<string, string> {
  const resolved = token === undefined ? getStoredAuthToken() : token
  if (resolved && resolved.trim()) {
    return { Authorization: `Bearer ${resolved.trim()}` }
  }
  return {}
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function createAuthApi(fetchFn: typeof fetch = fetch) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetchFn(path, init)
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ApiError('offline', 'Không kết nối được máy chủ xác thực.', 0)
    }
    if (res.ok) return res.json() as Promise<T>
    let body: { detail?: { code?: string; message?: string } | string } | null = null
    try {
      body = await res.json() as { detail?: { code?: string; message?: string } | string }
    } catch { /* non-JSON */ }
    const detail = body?.detail
    if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
      throw new ApiError(detail.code || `http_${res.status}`, detail.message, res.status)
    }
    throw new ApiError(`http_${res.status}`, `Máy chủ lỗi (${res.status}).`, res.status)
  }

  return {
    me(token: string | null, signal?: AbortSignal) {
      return request<AuthMeResponse>('/api/auth/me', {
        headers: authHeaders(token),
        signal,
      })
    },
    login(username: string, password: string, signal?: AbortSignal) {
      return request<AuthResponse>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal,
      })
    },
    register(input: RegisterInput, signal?: AbortSignal) {
      return request<AuthResponse>('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal,
      })
    },
    logout(token: string | null, signal?: AbortSignal) {
      return request<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
        headers: authHeaders(token),
        signal,
      })
    },
  }
}

export const authApi = createAuthApi()
