/**
 * Ước lượng mặt sàn bằng con quay (không phải nhận diện mặt phẳng thật).
 * Giả định: điện thoại cầm dọc, camera cao ~1,4 m, trường nhìn dọc ~62°. Các số là tự ước tính.
 * Khi camera chúc xuống, một tia từ điểm trên màn hình cắt sàn ở khoảng cách d; ta neo mascot ở đó
 * rồi chiếu lại theo hướng/độ nghiêng mới để chân mascot "dính" sàn khi người dùng xoay máy.
 */
export const CAMERA_HEIGHT_M = 1.4
export const VFOV_DEG = 62
export const REF_DISTANCE_M = 1.2
export const GROUND_MIN_PITCH = 12
export const GROUND_MAX_PITCH = 75
export const FOOT_X = 0.72
export const FOOT_Y = 0.82

export type Pose = { pitchDown: number; heading: number }
export type View = { aspect: number }
export type GroundAnchor = { distance: number; yaw: number }
export type ScreenFoot = { x: number; y: number; zoom: number }

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
const halfV = () => Math.tan(rad(VFOV_DEG / 2))
const halfH = (view: View) => halfV() * view.aspect

/** beta của deviceorientation: 90 = cầm dọc thẳng, giảm dần khi chúc camera xuống sàn. */
export function pitchDownFromBeta(beta: number) {
  return 90 - beta
}

export function groundReady(pitchDown: number) {
  return pitchDown >= GROUND_MIN_PITCH && pitchDown <= GROUND_MAX_PITCH
}

export function anchorAt(pose: Pose, x: number, y: number, view: View): GroundAnchor | null {
  const below = pose.pitchDown + deg(Math.atan((y - 0.5) * 2 * halfV()))
  if (below <= 2) return null
  const side = deg(Math.atan((x - 0.5) * 2 * halfH(view)))
  return { distance: CAMERA_HEIGHT_M / Math.tan(rad(below)), yaw: wrap(pose.heading + side) }
}

export function projectAnchor(anchor: GroundAnchor, pose: Pose, view: View): ScreenFoot | null {
  const side = wrap(anchor.yaw - pose.heading)
  if (Math.abs(side) >= 80) return null
  const below = deg(Math.atan(CAMERA_HEIGHT_M / anchor.distance))
  const x = 0.5 + Math.tan(rad(side)) / (2 * halfH(view))
  const y = 0.5 + Math.tan(rad(below - pose.pitchDown)) / (2 * halfV())
  const zoom = Math.min(1.6, Math.max(0.35, REF_DISTANCE_M / anchor.distance))
  return { x, y, zoom }
}
