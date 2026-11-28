import { useEffect, useRef, useState } from 'react'
import { anchorAt, FOOT_X, FOOT_Y, groundReady, pitchDownFromBeta, projectAnchor, type GroundAnchor, type Pose, type ScreenFoot } from './groundAnchor'

export type GroundStatus = 'searching' | 'locked' | 'fallback' | 'needs-permission'

const SMOOTH = 0.25
const HOLD_MS = 400
const NO_SENSOR_MS = 1500
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

type Options = {
  enabled: boolean
  /** Kích thước khung camera hiển thị, để suy ra trường nhìn ngang. */
  viewport: () => { width: number; height: number } | null
  onFoot: (foot: ScreenFoot | null) => void
}

/**
 * Đọc con quay, chờ camera chúc xuống thấy sàn rồi neo mascot ở góc dưới phải; sau đó chiếu lại theo từng
 * lần xoay máy. Không có cảm biến (máy tính, chưa cấp quyền iOS) thì đặt cố định ở góc dưới phải.
 */
export function useGroundAnchor({ enabled, viewport, onFoot }: Options) {
  const [status, setStatus] = useState<GroundStatus>('searching')
  const pose = useRef<Pose | null>(null)
  const anchor = useRef<GroundAnchor | null>(null)
  const readySince = useRef(0)
  const manualPlaced = useRef(false)
  const foot = useRef(onFoot)
  const view = useRef(viewport)
  foot.current = onFoot
  view.current = viewport

  function aspect() {
    const v = view.current()
    return v && v.height > 0 ? v.width / v.height : 9 / 19.5
  }

  useEffect(() => {
    if (!enabled) return
    anchor.current = null
    pose.current = null
    readySince.current = 0
    manualPlaced.current = false
    setStatus('searching')
    const needsPermission = typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function'
    let gotEvent = false
    const fallback = window.setTimeout(() => {
      if (gotEvent) return
      setStatus(needsPermission ? 'needs-permission' : 'fallback')
      if (!manualPlaced.current) foot.current({ x: FOOT_X, y: 0.88, zoom: 1 })
    }, NO_SENSOR_MS)

    function onOrientation(e: DeviceOrientationEvent) {
      if (e.beta == null || e.alpha == null) return
      if (!gotEvent) { gotEvent = true; window.clearTimeout(fallback); setStatus(s => s === 'locked' ? s : 'searching') }
      const next = { pitchDown: pitchDownFromBeta(e.beta), heading: -e.alpha }
      const p = pose.current
      pose.current = p ? {
        pitchDown: p.pitchDown + (next.pitchDown - p.pitchDown) * SMOOTH,
        heading: p.heading + wrap(next.heading - p.heading) * SMOOTH,
      } : next
      const v = { aspect: aspect() }
      if (!anchor.current) {
        if (!groundReady(pose.current.pitchDown)) { readySince.current = 0; return }
        const now = performance.now()
        if (!readySince.current) { readySince.current = now; return }
        if (now - readySince.current < HOLD_MS) return
        anchor.current = anchorAt(pose.current, FOOT_X, FOOT_Y, v)
        if (!anchor.current) return
        setStatus('locked')
      }
      foot.current(projectAnchor(anchor.current, pose.current, v))
    }
    window.addEventListener('deviceorientation', onOrientation)
    return () => { window.clearTimeout(fallback); window.removeEventListener('deviceorientation', onOrientation) }
  }, [enabled])

  return {
    status,
    /** Ghi nhận người dùng đã chạm đặt thủ công để fallback không kéo mascot đi chỗ khác. */
    markManualPlacement() {
      manualPlaced.current = true
    },
    /** Chạm vào khung hình: neo lại tại điểm chạm nếu điểm đó nằm trên sàn. */
    reanchor(x: number, y: number) {
      if (!pose.current || status !== 'locked') return false
      const next = anchorAt(pose.current, x, y, { aspect: aspect() })
      if (!next) return false
      anchor.current = next
      foot.current(projectAnchor(next, pose.current, { aspect: aspect() }))
      return true
    },
    /** iOS: phải xin quyền trong một lần chạm. */
    async grant() {
      const api = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
      try {
        if ((await api.requestPermission?.()) === 'granted') { setStatus('searching'); return true }
      } catch { /* bỏ qua */ }
      setStatus('fallback')
      return false
    },
  }
}
