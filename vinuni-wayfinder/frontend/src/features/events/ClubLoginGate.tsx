import { useState, type FormEvent, type ReactNode } from 'react'
import { LogIn, ShieldCheck, UserPlus } from 'lucide-react'
import { ApiError } from '../wayfinder/wayfinderApi'
import { useWayfinder } from '../wayfinder/WayfinderContext'
import { useAuth } from './AuthContext'

type AuthTab = 'login' | 'register'

export function ClubLoginGate({ children }: { children: ReactNode }) {
  const { isLive } = useWayfinder()
  const { account, loading, login, register } = useAuth()
  const [tab, setTab] = useState<AuthTab>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [clubName, setClubName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Chế độ cục bộ / offline: không chặn người dùng trải nghiệm thử.
  if (!isLive) return <>{children}</>

  if (loading) {
    return (
      <div className="narrow-page events-empty" role="status">
        <ShieldCheck size={32} />
        <p>Đang kiểm tra phiên đăng nhập BTC…</p>
      </div>
    )
  }

  if (account) return <>{children}</>

  function switchTab(next: AuthTab) {
    setTab(next)
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const uname = username.trim().toLowerCase()
    if (!uname || !password) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.')
      return
    }
    if (tab === 'register' && !displayName.trim()) {
      setError('Vui lòng nhập tên hiển thị của ban tổ chức hoặc CLB.')
      return
    }
    setSubmitting(true)
    try {
      if (tab === 'login') {
        await login(uname, password)
      } else {
        await register({
          username: uname,
          password,
          displayName: displayName.trim(),
          clubName: clubName.trim(),
        })
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể xác thực tài khoản lúc này.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="narrow-page btc-auth-gate">
      <div className="btc-auth-card">
        <p className="studio-kicker">Cổng Ban Tổ Chức VinUni</p>
        <h1 tabIndex={-1}>{tab === 'login' ? 'Đăng nhập BTC' : 'Đăng ký tài khoản CLB'}</h1>
        <p className="field-hint">
          {tab === 'login'
            ? 'Đăng nhập để quản lý sự kiện, điểm dừng và mascot của câu lạc bộ trên hệ thống.'
            : 'Tạo tài khoản CLB để đăng sự kiện và quản lý riêng dữ liệu của đơn vị mình.'}
        </p>

        <div className="creator-modes" role="tablist" aria-label="Chế độ xác thực BTC">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'login'}
            aria-pressed={tab === 'login'}
            onClick={() => switchTab('login')}
          >
            <LogIn size={16} />
            Đăng nhập BTC
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'register'}
            aria-pressed={tab === 'register'}
            onClick={() => switchTab('register')}
          >
            <UserPlus size={16} />
            Đăng ký tài khoản CLB
          </button>
        </div>

        <form className="event-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="btc-username">
            Tên đăng nhập
            <input
              id="btc-username"
              autoComplete="username"
              maxLength={40}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Ví dụ: clb_robotics"
              required
            />
          </label>

          <label htmlFor="btc-password">
            Mật khẩu
            <input
              id="btc-password"
              type="password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              maxLength={128}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={tab === 'register' ? 'Tối thiểu 6 ký tự' : 'Nhập mật khẩu'}
              required
            />
          </label>

          {tab === 'register' && (
            <>
              <label htmlFor="btc-display-name">
                Tên hiển thị BTC / Người phụ trách
                <input
                  id="btc-display-name"
                  maxLength={80}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Ví dụ: Ban Truyền Thông CLB Robotics"
                  required
                />
              </label>

              <label htmlFor="btc-club-name">
                Tên câu lạc bộ / Đơn vị tổ chức
                <input
                  id="btc-club-name"
                  maxLength={80}
                  value={clubName}
                  onChange={e => setClubName(e.target.value)}
                  placeholder="Ví dụ: VinUni Robotics Club"
                />
              </label>
            </>
          )}

          {error && <p className="error-message" role="alert">{error}</p>}

          <div className="editor-actions">
            <button type="submit" className="button button-primary" disabled={submitting}>
              {tab === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
              {submitting
                ? 'Đang xử lý…'
                : tab === 'login'
                  ? 'Đăng nhập'
                  : 'Tạo tài khoản CLB'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
