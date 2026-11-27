import { useEffect, useRef, useState } from 'react'

/** iOS bắt buộc xin quyền cảm biến từ một lần chạm của người dùng. */
export async function requestSensorPermission() {
  const asks = []
  if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) asks.push(DeviceOrientationEvent.requestPermission())
  if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) asks.push(DeviceMotionEvent.requestPermission())
  const res = await Promise.allSettled(asks)
  return res.every((r) => r.status === 'fulfilled' && r.value === 'granted')
}

/** GPS cập nhật liên tục. */
export function useGeolocation(enabled) {
  const [pos, setPos] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!enabled) return
    if (!navigator.geolocation) { setError('Trình duyệt không hỗ trợ GPS'); return }
    const id = navigator.geolocation.watchPosition(
      (p) => { setError(null); setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp }) },
      (e) => setError(e.code === 1 ? 'Bạn chưa cho phép truy cập vị trí' : 'Chưa lấy được vị trí GPS'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [enabled])
  return { pos, error }
}

/** Hướng la bàn (độ, 0 = Bắc). null nếu máy không có la bàn / chưa cấp quyền. */
export function useCompass(enabled) {
  const [heading, setHeading] = useState(null)
  useEffect(() => {
    if (!enabled) return
    let gotAbsolute = false
    const onAbs = (e) => {
      if (e.alpha == null) return
      gotAbsolute = true
      setHeading((360 - e.alpha + screenAngle()) % 360)
    }
    const onRel = (e) => {
      if (e.webkitCompassHeading != null) setHeading((e.webkitCompassHeading + screenAngle()) % 360) // iOS
      else if (!gotAbsolute && e.absolute && e.alpha != null) setHeading((360 - e.alpha + screenAngle()) % 360)
    }
    window.addEventListener('deviceorientationabsolute', onAbs)
    window.addEventListener('deviceorientation', onRel)
    return () => {
      window.removeEventListener('deviceorientationabsolute', onAbs)
      window.removeEventListener('deviceorientation', onRel)
    }
  }, [enabled])
  return heading
}

const screenAngle = () => (screen.orientation?.angle ?? window.orientation ?? 0)

/** Đếm bước từ gia tốc kế (đỉnh của độ lớn gia tốc đã lọc). Ước lượng thô. */
export function useStepCounter(enabled) {
  const [steps, setSteps] = useState(0)
  const st = useRef({ avg: 9.8, last: 0, above: false })
  useEffect(() => {
    if (!enabled) return
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity
      if (!a || a.x == null) return
      const mag = Math.hypot(a.x, a.y, a.z)
      const s = st.current
      s.avg = s.avg * 0.9 + mag * 0.1
      const now = performance.now()
      const hi = s.avg + 1.2, lo = s.avg - 0.3
      if (!s.above && mag > hi && now - s.last > 300) {
        s.above = true
        s.last = now
        setSteps((n) => n + 1)
      } else if (s.above && mag < lo) {
        s.above = false
      }
    }
    window.addEventListener('devicemotion', onMotion)
    return () => window.removeEventListener('devicemotion', onMotion)
  }, [enabled])
  return [steps, () => setSteps(0)]
}

export const STEP_LENGTH_M = 0.7 // (tự ước tính) bước chân trung bình

/** Lấy trung bình nhiều lần đo GPS (dùng khi neo bản đồ / ghi toạ độ một điểm). */
export function averageGps({ samples = 8, timeoutMs = 20000, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Trình duyệt không hỗ trợ GPS'))
    const got = []
    const done = () => {
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
      if (!got.length) return reject(new Error('Không lấy được GPS'))
      // ưu tiên các lần đo chính xác nhất
      const best = [...got].sort((a, b) => a.acc - b.acc).slice(0, Math.max(3, Math.ceil(got.length / 2)))
      const w = best.map((p) => 1 / Math.max(p.acc, 1) ** 2)
      const sw = w.reduce((a, b) => a + b, 0)
      resolve({
        lat: best.reduce((s, p, i) => s + p.lat * w[i], 0) / sw,
        lng: best.reduce((s, p, i) => s + p.lng * w[i], 0) / sw,
        acc: Math.min(...best.map((p) => p.acc)),
        n: got.length,
      })
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        got.push({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy })
        onProgress?.(got.length, p.coords.accuracy)
        if (got.length >= samples) done()
      },
      (e) => { if (e.code === 1) { navigator.geolocation.clearWatch(id); clearTimeout(timer); reject(new Error('Bạn chưa cho phép truy cập vị trí')) } },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    )
    const timer = setTimeout(done, timeoutMs)
  })
}
