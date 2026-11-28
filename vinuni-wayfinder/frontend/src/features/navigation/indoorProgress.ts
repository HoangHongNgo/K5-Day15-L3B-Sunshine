import { stepDirection, type BackendStep } from '../wayfinder/wayfinderApi'

/** Ngưỡng PDR trong nhà — heuristic (tự ước tính), chưa đo ở Tòa G / Tòa I. */
export const NEAR_RATIO = 0.75
export const TURN_MIN_RATIO = 0.6
export const TURN_MIN_DEG = 45
export const BACK_MIN_DEG = 150
export const ASK_RATIO = 1.3
export const ASK_SNOOZE_RATIO = 0.3

export type NextTurn = 'left' | 'right' | 'back'
export type IndoorState = 'walking' | 'near' | 'turned' | 'ask'
export type IndoorProgress = { state: IndoorState; ratio: number; remaining: number }

/** Góc xoay theo chiều kim đồng hồ từ hướng `from` sang `to`, trong (-180, 180]. */
export function headingDelta(from: number, to: number) {
  const d = (((to - from) % 360) + 540) % 360 - 180
  return d === -180 ? 180 : d
}

/** Chặng sau bắt đầu bằng rẽ/quay lại → người đi phải xoay người đúng hướng đó khi tới mốc. */
export function nextTurnOf(step: BackendStep | undefined): NextTurn | null {
  if (!step) return null
  const dir = stepDirection(step)
  return dir === 'left' || dir === 'right' || dir === 'back' ? dir : null
}

function turnMatches(turn: NextTurn, deg: number) {
  if (turn === 'back') return Math.abs(deg) >= BACK_MIN_DEG
  return turn === 'right' ? deg >= TURN_MIN_DEG : deg <= -TURN_MIN_DEG
}

/**
 * Đếm bước + la bàn. Không bao giờ tự chuyển chỉ vì số mét: quá `promptAt` thì hỏi lại người dùng.
 * `turned` (đã đi phần lớn chặng và xoay đúng hướng chặng sau) là tín hiệu đủ mạnh để tự chuyển.
 */
export function indoorProgress({ meters, walked, turnDeg, nextTurn, promptAt = ASK_RATIO }: {
  meters: number; walked: number; turnDeg: number | null; nextTurn: NextTurn | null; promptAt?: number
}): IndoorProgress {
  if (!(meters > 0)) return { state: 'walking', ratio: 0, remaining: 0 }
  const ratio = walked / meters
  const remaining = Math.max(0, Math.round(meters - walked))
  if (nextTurn && turnDeg != null && ratio >= TURN_MIN_RATIO && turnMatches(nextTurn, turnDeg)) return { state: 'turned', ratio, remaining }
  if (ratio >= promptAt) return { state: 'ask', ratio, remaining }
  return { state: ratio >= NEAR_RATIO ? 'near' : 'walking', ratio, remaining }
}

export function hasMotionReading(reading: DeviceMotionEventAcceleration | null) {
  return reading !== null && Number.isFinite(reading.x) && Number.isFinite(reading.y) && Number.isFinite(reading.z)
}

/**
 * Chọn cách tự chuyển chặng: ngoài trời dùng GPS; trong nhà dùng đếm bước khi nhận được dữ liệu cảm biến.
 * Camera là phương án dự phòng khi chưa có dữ liệu gia tốc hợp lệ.
 */
export function trackingModes({ outdoorGps, indoorStep, motionSensor, cameraReady }: {
  outdoorGps: boolean; indoorStep: boolean; motionSensor: boolean; cameraReady: boolean
}) {
  const pdr = !outdoorGps && indoorStep && motionSensor
  return { gps: outdoorGps, pdr, photo: !outdoorGps && !pdr && cameraReady }
}
