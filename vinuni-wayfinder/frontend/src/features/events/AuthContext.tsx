import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import {
  authApi,
  getStoredAuthToken,
  setStoredAuthToken,
  type OrganizerAccount,
  type RegisterInput,
} from './authApi'

export type AuthContextValue = {
  account: OrganizerAccount | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<OrganizerAccount>
  register: (input: RegisterInput) => Promise<OrganizerAccount>
  logout: () => Promise<void>
  canManage: (ownerId?: string | null) => boolean
}

const Context = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLive } = useWayfinder()
  const [token, setToken] = useState<string | null>(() => getStoredAuthToken())
  const [account, setAccount] = useState<OrganizerAccount | null>(null)
  const [loading, setLoading] = useState<boolean>(() => Boolean(getStoredAuthToken()))

  useEffect(() => {
    if (!isLive) {
      setLoading(false)
      return
    }
    const stored = getStoredAuthToken()
    if (!stored) {
      setAccount(null)
      setToken(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    authApi.me(stored, controller.signal)
      .then(res => {
        if (controller.signal.aborted) return
        if (res.authenticated && res.account) {
          setToken(stored)
          setAccount(res.account)
        } else {
          setStoredAuthToken(null)
          setToken(null)
          setAccount(null)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAccount(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [isLive])

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password)
    setStoredAuthToken(res.token)
    setToken(res.token)
    setAccount(res.account)
    return res.account
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const res = await authApi.register(input)
    setStoredAuthToken(res.token)
    setToken(res.token)
    setAccount(res.account)
    return res.account
  }, [])

  const logout = useCallback(async () => {
    const current = token ?? getStoredAuthToken()
    setStoredAuthToken(null)
    setToken(null)
    setAccount(null)
    if (current) {
      try {
        await authApi.logout(current)
      } catch {
        /* ignore network errors on logout */
      }
    }
  }, [token])

  const canManage = useCallback((ownerId?: string | null) => {
    if (!account) return false
    if (account.role === 'admin_truong') return true
    return !ownerId || ownerId === account.id
  }, [account])

  const value = useMemo<AuthContextValue>(() => ({
    account,
    token,
    loading,
    login,
    register,
    logout,
    canManage,
  }), [account, token, loading, login, register, logout, canManage])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(Context)
  if (!ctx) {
    return {
      account: null,
      token: null,
      loading: false,
      login: async () => { throw new Error('Missing AuthProvider') },
      register: async () => { throw new Error('Missing AuthProvider') },
      logout: async () => {},
      canManage: () => false,
    }
  }
  return ctx
}
