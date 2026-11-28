import * as THREE from 'three'

/** Toán thuần và helper cho AR thật (WebXR + iPhone AR Quick Look). */

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

/** Chọn clip vòng lặp trong WebXR mà không cắt ngang động tác một lần (wave/jump/dance). */
export function chooseArLocomotionClip(options: {
  moving: boolean
  oneShotActive: boolean
  clips: readonly string[]
}): 'walk' | 'idle' | null {
  if (options.oneShotActive) return null
  if (options.moving) return options.clips.includes('walk') ? 'walk' : null
  return options.clips.includes('idle') ? 'idle' : null
}

function averageVertexColor(geometry: THREE.BufferGeometry): THREE.Color | null {
  const attr = geometry.getAttribute('color')
  if (!attr || attr.count === 0) return null
  let r = 0, g = 0, b = 0
  for (let i = 0; i < attr.count; i++) {
    r += attr.getX(i)
    g += attr.getY(i)
    b += attr.getZ(i)
  }
  return new THREE.Color(r / attr.count, g / attr.count, b / attr.count)
}

function toUsdzMaterial(
  source: THREE.Material,
  geometry: THREE.BufferGeometry,
  disposables: Array<{ dispose: () => void }>,
): THREE.MeshStandardMaterial {
  const std = source as THREE.MeshStandardMaterial
  const baseColor = std.color ? std.color.clone() : new THREE.Color(0xffffff)
  const vertexAvg = std.vertexColors ? averageVertexColor(geometry) : null
  if (vertexAvg) baseColor.multiply(vertexAvg)
  const baked = new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness: typeof std.roughness === 'number' ? std.roughness : 0.75,
    metalness: typeof std.metalness === 'number' ? std.metalness : 0.0,
    map: std.map ?? null,
    transparent: Boolean(std.transparent),
    opacity: typeof std.opacity === 'number' ? std.opacity : 1,
    side: std.side,
  })
  disposables.push(baked)
  return baked
}

/**
 * Chuyển `SkinnedMesh` sang `Mesh` tĩnh ở tư thế nghỉ và bake `vertexColors` vào `MeshStandardMaterial`
 * để `USDZExporter` trên iPhone AR Quick Look giữ đúng màu lông thay vì render trắng bệch.
 */
export function prepareSceneForUsdz(root: THREE.Object3D): () => void {
  root.updateMatrixWorld(true)
  const disposables: Array<{ dispose: () => void }> = []
  const targets: THREE.Mesh[] = []

  root.traverse(obj => {
    if (obj instanceof THREE.Mesh) targets.push(obj)
  })

  for (const mesh of targets) {
    const isSkinned = mesh instanceof THREE.SkinnedMesh
    const srcGeom = mesh.geometry as THREE.BufferGeometry
    const hasVertexColors = Boolean(srcGeom.getAttribute('color'))
    const rawMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const needsBake = isSkinned || hasVertexColors || !(rawMat instanceof THREE.MeshStandardMaterial)
    if (!needsBake || !rawMat) continue

    const bakedGeom = srcGeom.clone()
    if (isSkinned) {
      mesh.skeleton?.update()
      const pos = bakedGeom.getAttribute('position')
      if (pos) {
        const v = new THREE.Vector3()
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i)
          mesh.applyBoneTransform(i, v)
          pos.setXYZ(i, v.x, v.y, v.z)
        }
        pos.needsUpdate = true
      }
      bakedGeom.deleteAttribute('skinIndex')
      bakedGeom.deleteAttribute('skinWeight')
      bakedGeom.computeVertexNormals()
    }
    const bakedMat = toUsdzMaterial(rawMat, srcGeom, disposables)
    if (hasVertexColors) bakedGeom.deleteAttribute('color')
    disposables.push(bakedGeom)

    if (isSkinned && mesh.parent) {
      const replacement = new THREE.Mesh(bakedGeom, bakedMat)
      replacement.name = mesh.name
      replacement.position.copy(mesh.position)
      replacement.quaternion.copy(mesh.quaternion)
      replacement.scale.copy(mesh.scale)
      replacement.visible = mesh.visible
      const parent = mesh.parent
      const index = parent.children.indexOf(mesh)
      parent.remove(mesh)
      if (index >= 0) parent.children.splice(index, 0, replacement)
      else parent.add(replacement)
      replacement.parent = parent
    } else {
      mesh.geometry = bakedGeom
      mesh.material = bakedMat
    }
  }

  return () => {
    for (const item of disposables) item.dispose()
  }
}
