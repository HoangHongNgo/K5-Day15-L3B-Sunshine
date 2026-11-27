import { Box3, DirectionalLight, HemisphereLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three'
import type { MascotAsset } from '../events/events'
import { createEventMascot } from './eventMascot'

// One offscreen context for library cards and the studio. Idle cards use ordinary images.
let renderer: WebGLRenderer | undefined
const cache = new WeakMap<MascotAsset, Map<number, string>>()

export function mascotPortrait(asset: MascotAsset, angle = 0): string {
  const portraits = cache.get(asset) ?? new Map<number, string>()
  const existing = portraits.get(angle)
  if (existing) return existing
  if (!renderer || renderer.getContext().isContextLost()) {
    renderer = new WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(320, 320)
    renderer.setClearColor(0x000000, 0)
  }
  const model = createEventMascot(asset)
  try {
    const scene = new Scene()
    scene.add(model.model, new HemisphereLight(0xffffff, 0xd2b59b, 2.4))
    const light = new DirectionalLight(0xfff3e7, 2.6)
    light.position.set(-3, 5, 6)
    scene.add(light)
    const bounds = new Box3().setFromObject(model.model)
    const center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3())
    const half = Math.max(size.y, Math.hypot(size.x, size.z)) * .56
    const camera = new OrthographicCamera(-half, half, half, -half, .01, 30)
    const yaw = .16 + angle * Math.PI / 4
    camera.position.copy(center).add(new Vector3(Math.sin(yaw) * 6, .55, Math.cos(yaw) * 6))
    camera.lookAt(center)
    renderer.render(scene, camera)
    const image = renderer.domElement.toDataURL('image/webp', .9)
    portraits.set(angle, image)
    cache.set(asset, portraits)
    return image
  } finally { model.dispose() }
}
