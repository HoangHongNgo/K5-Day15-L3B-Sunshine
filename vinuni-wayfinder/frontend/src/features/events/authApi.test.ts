import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../wayfinder/wayfinderApi'
import {
  AUTH_TOKEN_KEY,
  authHeaders,
  createAuthApi,
  getStoredAuthToken,
  setStoredAuthToken,
  type OrganizerAccount,
} from './authApi'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const sampleAccount: OrganizerAccount = {
  id: 'acc_1',
  username: 'clb_robotics',
  displayName: 'CLB Robotics',
  clubName: 'VinUni Robotics Club',
  role: 'clb',
}

describe('BTC Auth API & token storage', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size },
    })
  })

  it('stores, reads, clears auth tokens and builds Authorization headers', () => {
    expect(getStoredAuthToken()).toBeNull()
    expect(authHeaders()).toEqual({})

    setStoredAuthToken('tok_secret_123')
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('tok_secret_123')
    expect(getStoredAuthToken()).toBe('tok_secret_123')
    expect(authHeaders()).toEqual({ Authorization: 'Bearer tok_secret_123' })
    expect(authHeaders('override_tok')).toEqual({ Authorization: 'Bearer override_tok' })
    expect(authHeaders(null)).toEqual({})

    setStoredAuthToken(null)
    expect(getStoredAuthToken()).toBeNull()
    expect(authHeaders()).toEqual({})
  })

  it('calls register, login, me, and logout endpoints with proper payloads and headers', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, account: sampleAccount, token: 'tok_reg' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, account: sampleAccount, token: 'tok_login' }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true, account: sampleAccount }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))

    const api = createAuthApi(fetchMock)

    const reg = await api.register({
      username: 'clb_robotics',
      password: 'password123',
      displayName: 'CLB Robotics',
      clubName: 'VinUni Robotics Club',
    })
    expect(reg.token).toBe('tok_reg')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/register')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')

    const logged = await api.login('clb_robotics', 'password123')
    expect(logged.account.id).toBe('acc_1')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/login')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST')

    const me = await api.me('tok_login')
    expect(me.authenticated).toBe(true)
    expect(fetchMock.mock.calls[2][0]).toBe('/api/auth/me')
    expect(fetchMock.mock.calls[2][1]?.headers).toEqual({ Authorization: 'Bearer tok_login' })

    const out = await api.logout('tok_login')
    expect(out.ok).toBe(true)
    expect(fetchMock.mock.calls[3][0]).toBe('/api/auth/logout')
    expect(fetchMock.mock.calls[3][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[3][1]?.headers).toEqual({ Authorization: 'Bearer tok_login' })
  })

  it('parses backend FastAPI error detail into ApiError', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ detail: { code: 'invalid_credentials', message: 'Sai tên đăng nhập hoặc mật khẩu.' } }, 401),
    )
    const api = createAuthApi(fetchMock)

    await expect(api.login('clb_robotics', 'wrong')).rejects.toBeInstanceOf(ApiError)

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ detail: { code: 'username_taken', message: 'Tên đăng nhập này đã được sử dụng.' } }, 409),
    )
    await expect(
      api.register({
        username: 'clb_robotics',
        password: 'password123',
        displayName: 'CLB',
        clubName: 'CLB',
      }),
    ).rejects.toMatchObject({
      code: 'username_taken',
      message: 'Tên đăng nhập này đã được sử dụng.',
      status: 409,
    })
  })
})
