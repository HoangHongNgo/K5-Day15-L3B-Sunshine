import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Bookmark, Compass, HelpCircle, MapPin, Navigation, WifiOff, X } from 'lucide-react'
import { usePwa } from './shared/usePwa'
import { useFavorites } from './shared/FavoritesContext'
import { Brand, IconButton, NotFound } from './shared/ui'
import { useWayfinder } from './features/wayfinder/WayfinderContext'
import { ExplorePage, PlaceDetailPage, SavedPage, AboutPage } from './features/explore/ExplorePages'
import { PlanRoutePage } from './features/navigation/PlanRoutePage'
import { ChooseLocationPage } from './features/navigation/ChooseLocationPage'
import { JourneyPage } from './features/navigation/JourneyPage'
import { PhotoLocationPage } from './features/localization/PhotoLocationPage'
import { MotionContext } from './features/mascot/Mascot'
import { useEventJourney } from './features/events/EventContext'
import { ClubDashboard, ClubMascots, EventEditor, EventsList, EventDetail } from './features/events/EventsPages'
import { CollectPage } from './features/collect/CollectPage'

const Mascot3dDemo = lazy(() => import('./features/mascot/Mascot3dDemo'))

function RouteFocus() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
  }, [pathname])
  return null
}

const motionPreference = () => window.matchMedia('(prefers-reduced-motion: reduce)')
const prefersReducedMotion = () => motionPreference().matches
function subscribeToMotion(change: () => void) {
  const preference = motionPreference()
  preference.addEventListener('change', change)
  return () => preference.removeEventListener('change', change)
}

export default function App() {
  const { isLive, places } = useWayfinder()
  const { mascot } = useEventJourney()
  const { storageError, visibleCount } = useFavorites()
  const motionPaused = useSyncExternalStore(subscribeToMotion, prefersReducedMotion)
  const pwa = usePwa()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isJourney = pathname === '/hanh-trinh'
  const isClub = pathname.startsWith('/clb')
  const isCollect = pathname === '/thu-thap'
  const isNavigation = ['/di-den', '/vi-tri', '/anh', '/hanh-trinh'].includes(pathname)

  useEffect(() => {
    const onHash = () => { if (window.location.hash === '#thu-thap') navigate('/thu-thap', { replace: true }) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [navigate])

  const nav = (
    <>
      <NavLink to="/" end className={!isNavigation && pathname !== '/da-luu' ? 'nav-item active' : 'nav-item'}><Compass size={21} /><span>Bản đồ</span></NavLink>
      <Link to="/di-den" className={`nav-item nav-primary ${isNavigation ? 'active' : ''}`} aria-current={isNavigation ? 'page' : undefined}><span className="nav-direction-icon"><Navigation size={21} /></span><span>Dẫn đường</span></Link>
      <NavLink to="/da-luu" className="nav-item"><Bookmark size={21} /><span>Đã lưu{visibleCount > 0 && <span className="saved-count">{visibleCount}</span>}</span></NavLink>
    </>
  )

  return (
    <MotionContext.Provider value={{ paused: motionPaused }}>
      <a href="#main-content" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus() }}>Đến nội dung chính</a>
      {!isJourney && <>
        <header className="site-header">
          <div className="header-inner">
            <Brand />
            <nav className="desktop-nav" aria-label="Điều hướng chính">{nav}</nav>
            <div className="header-actions">
              <span className="campus-label"><MapPin size={16} /><span>VinUniversity</span></span>
              <Link className="icon-button help-link" to="/ve-ung-dung" aria-label="Thông tin bản trải nghiệm"><HelpCircle size={21} /></Link>
            </div>
          </div>
        </header>
        <div className="app-statusbar">
          <div>
            <span><MapPin size={14} aria-hidden="true" />{isLive ? 'VinUni Wayfinder · trực tiếp' : 'Bản trải nghiệm · mô phỏng'}</span>
            <span className="statusbar-detail">{isLive ? `${places.length} điểm đến` : 'Toà I, tầng trệt'}</span>
            <span className="statusbar-right">{!pwa.online ? <><WifiOff size={14} />Đang ngoại tuyến</> : `Đi cùng ${mascot.name}`}</span>
          </div>
        </div>
      </>}
      {(!pwa.online || pwa.error || storageError) && (
        <div className="system-message" role="status">
          {!pwa.online ? 'Bạn đang ngoại tuyến. Tìm kiếm và tuyến mẫu vẫn dùng được; tour của trường cần mạng.' : pwa.error || (storageError ? 'Chưa thể lưu lâu dài trên thiết bị này. Danh sách chỉ được giữ trong phiên hiện tại.' : '')}
        </div>
      )}
      {pwa.needRefresh[0] && !isJourney && (
        <div className="update-banner" role="status">
          <span>VinUni AR Map có phiên bản mới.</span>
          <button onClick={() => void pwa.updateServiceWorker(true)}>Cập nhật ngay</button>
          <IconButton label="Để lần sau" onClick={() => pwa.needRefresh[1](false)}><X size={18} /></IconButton>
        </div>
      )}
      <main id="main-content" tabIndex={-1} className={`app-main ${isJourney ? 'in-journey' : ''} ${pathname === '/' ? 'map-main' : ''} ${isClub ? 'club-main' : ''} ${isCollect ? 'collect-main' : ''}`}>
        <Routes>
          <Route path="/mascot-3d" element={<Suspense fallback={<p role="status">Đang mở mascot 3D…</p>}><Mascot3dDemo /></Suspense>} />
          <Route path="/thu-thap" element={<CollectPage />} />
          <Route path="/clb" element={<ClubDashboard />} />
          <Route path="/clb/mascot" element={<ClubMascots />} />
          <Route path="/clb/su-kien/moi" element={<EventEditor />} />
          <Route path="/clb/su-kien/:id/chinh-sua" element={<EventEditor />} />
          <Route path="/su-kien" element={<EventsList />} />
          <Route path="/su-kien/:id" element={<EventDetail />} />
          <Route path="/" element={<ExplorePage />} />
          <Route path="/dia-diem/:id" element={<PlaceDetailPage />} />
          <Route path="/di-den" element={<PlanRoutePage />} />
          <Route path="/vi-tri" element={<ChooseLocationPage />} />
          <Route path="/anh" element={<PhotoLocationPage />} />
          {/* Bộ ảnh mẫu (prototype) đã bỏ: link cũ chuyển về màn chụp ảnh định vị. */}
          {['/anh-mau', '/nhan-dien', '/xac-nhan-vi-tri', '/ghim-anh'].map(path => <Route key={path} path={path} element={<ToPhotoLocate />} />)}
          <Route path="/hanh-trinh" element={<JourneyPage />} />
          <Route path="/da-luu" element={<SavedPage />} />
          <Route path="/ve-ung-dung" element={<AboutPage />} />
          <Route path="/ve-sunshine" element={<Navigate to="/ve-ung-dung" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <RouteFocus />
      </main>
      {!isJourney && !isClub && !isCollect && <nav className="bottom-nav" aria-label="Điều hướng trên điện thoại">{nav}</nav>}
    </MotionContext.Provider>
  )
}

function ToPhotoLocate() {
  const { search } = useLocation()
  const q = new URLSearchParams(search)
  const keep = new URLSearchParams()
  for (const key of ['to', 'event']) { const v = q.get(key); if (v) keep.set(key, v) }
  return <Navigate to={`/anh${keep.size ? `?${keep}` : ''}`} replace />
}
