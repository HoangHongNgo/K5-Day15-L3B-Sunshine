const R = 6371008.8
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

export function distanceM(a, b) {
  const dp = rad(b.lat - a.lat), dl = rad(b.lng - a.lng)
  const x = Math.sin(dp / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** Hướng từ a tới b, độ (0 = Bắc, theo chiều kim đồng hồ). */
export function bearingDeg(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** Phép đồng dạng pixel <-> lat/lng từ >= 2 neo (giống backend/app/geo.py). */
export function fitTransform(anchors) {
  const ok = (anchors || []).filter((a) => a.lat != null && a.lng != null)
  if (ok.length < 2) return null
  const lat0 = ok[0].lat, lng0 = ok[0].lng
  const en = (lat, lng) => [rad(lng - lng0) * R * Math.cos(rad(lat0)), rad(lat - lat0) * R]
  const src = ok.map((a) => [a.x, -a.y])
  const dst = ok.map((a) => en(a.lat, a.lng))
  const n = ok.length
  const ms = [src.reduce((s, p) => s + p[0], 0) / n, src.reduce((s, p) => s + p[1], 0) / n]
  const md = [dst.reduce((s, p) => s + p[0], 0) / n, dst.reduce((s, p) => s + p[1], 0) / n]
  // a = sum((d-md) * conj(s-ms)) / sum(|s-ms|^2)  (số phức)
  let nr = 0, ni = 0, den = 0
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - ms[0], sy = src[i][1] - ms[1]
    const dx = dst[i][0] - md[0], dy = dst[i][1] - md[1]
    nr += dx * sx + dy * sy
    ni += dy * sx - dx * sy
    den += sx * sx + sy * sy
  }
  if (!den) return null
  const ar = nr / den, ai = ni / den
  const br = md[0] - (ar * ms[0] - ai * ms[1]), bi = md[1] - (ar * ms[1] + ai * ms[0])
  return {
    metersPerPx: Math.hypot(ar, ai),
    toLL(x, y) {
      const zx = x, zy = -y
      const e = ar * zx - ai * zy + br, nn = ar * zy + ai * zx + bi
      return { lat: lat0 + deg(nn / R), lng: lng0 + deg(e / (R * Math.cos(rad(lat0)))) }
    },
    toPx(lat, lng) {
      const [e, nn] = en(lat, lng)
      const dx = e - br, dy = nn - bi, m = ar * ar + ai * ai
      const zx = (dx * ar + dy * ai) / m, zy = (dy * ar - dx * ai) / m
      return { x: zx, y: -zy }
    },
  }
}
