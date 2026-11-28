/** Toán thuần cho AR thật (WebXR): joystick → bước đi của mascot trên mặt phẳng đã dò. */

const DEAD_ZONE = 0.15

export function joystickVector(dx: number, dy: number, radius: number) {
  let x = dx / radius, y = dy / radius
  const len = Math.hypot(x, y)
  if (len < DEAD_ZONE) return { x: 0, y: 0 }
  if (len > 1) { x /= len; y /= len }
  return { x, y }
}

/**
 * `cameraYaw`: góc quay quanh trục đứng của camera (0 = nhìn về -Z, dương = quay trái, theo quy ước three.js).
 * Đẩy lên = đi ra xa camera; đẩy phải = sang phải camera. `facing`: rotation.y để mascot (mặt hướng +Z) nhìn theo hướng đi.
 */
export function joystickMove(stick: { x: number; y: number }, cameraYaw: number, speed: number, dt: number) {
  if (!stick.x && !stick.y) return { dx: 0, dz: 0, facing: null as number | null }
  const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw)
  const rx = Math.cos(cameraYaw), rz = -Math.sin(cameraYaw)
  const step = speed * dt
  const dx = (rx * stick.x - fx * stick.y) * step
  const dz = (rz * stick.x - fz * stick.y) * step
  return { dx: dx + 0, dz: dz + 0, facing: Math.atan2(dx, dz) as number | null }
}
