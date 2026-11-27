import { lazy, Suspense } from 'react'
import { BackLink } from '../../shared/ui'
import './collect.css'

const Collect = lazy(() => import('./Collect.jsx'))

export function CollectPage() {
  return (
    <div className="collect-page">
      <div style={{ marginBottom: 8 }}><BackLink to="/">Về bản đồ</BackLink></div>
      <Suspense fallback={<div className="card">Đang tải giao diện Thu thập…</div>}><Collect /></Suspense>
    </div>
  )
}
