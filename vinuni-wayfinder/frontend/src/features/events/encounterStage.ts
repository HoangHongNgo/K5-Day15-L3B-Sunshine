import * as THREE from 'three'
import type { MascotAsset } from './events'
import { createEventMascot } from '../mascot/eventMascot'

export type EncounterMotion = 'wave' | 'jump' | 'dance' | 'talk'

export function frameMascot(width: number, height: number, modelWidth: number, modelHeight: number,
  footX: number, footY: number, zoom: number) {
  const baseScale = Math.min(.65 * height / modelHeight, .78 * width / modelWidth)
  const scale = Math.min(baseScale * zoom, .94 * width / modelWidth, .94 * height / modelHeight)
  const sideRoom = (width - scale * modelWidth) / 2
  return {
    scale,
    x: THREE.MathUtils.clamp((footX - .5) * width, -sideRoom, sideRoom),
    y: THREE.MathUtils.clamp((.5 - footY) * height, -height / 2, height / 2 - scale * modelHeight),
  }
}

/** Screen-space placement keeps the mascot anchored to the chosen spot in the camera frame. */
export function createEncounterStage(canvas: HTMLCanvasElement, mascot: MascotAsset) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xfff9ee, 0xa1b6c8, 2.2))
  const light = new THREE.DirectionalLight(0xfff3db, 2.8)
  light.position.set(-3, 5, 4)
  scene.add(light)
  const asset = createEventMascot(mascot)
  const bounds = new THREE.Box3().setFromObject(asset.model)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const offset = new THREE.Group()
  offset.position.set(-center.x, -bounds.min.y, -center.z)
  offset.add(asset.model)
  const placement = new THREE.Group()
  // Bóng đổ dẹt dưới chân để mascot trông như đứng trên sàn.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.5, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false }))
  shadow.scale.set(size.x * .95, Math.max(size.x * .16, size.y * .035), 1)
  shadow.position.set(0, size.y * .012, -Math.max(size.z, 1))
  shadow.renderOrder = -1
  placement.add(shadow)
  placement.add(offset)
  placement.visible = false
  scene.add(placement)
  const mixer = new THREE.AnimationMixer(asset.model)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 3000)
  camera.position.z = 1500
  let x = .5, y = .78, zoom = 1
  function render() { renderer.render(scene, camera) }
  function updatePlacement() {
    const { clientWidth: w, clientHeight: h } = canvas
    if (!w || !h) return
    const frame = frameMascot(w, h, size.x, size.y, x, y, zoom)
    placement.scale.setScalar(frame.scale)
    placement.position.set(frame.x, frame.y, 0)
    camera.left = -w / 2
    camera.right = w / 2
    camera.top = h / 2
    camera.bottom = -h / 2
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    render()
  }
  const observer = new ResizeObserver(updatePlacement)
  observer.observe(canvas)
  updatePlacement()
  function stop() {
    renderer.setAnimationLoop(null)
    mixer.stopAllAction()
    render()
  }
  mixer.addEventListener('finished', () => renderer.setAnimationLoop(null))
  return {
    place(px: number, py: number) {
      x = px
      y = py
      placement.visible = true
      updatePlacement()
    },
    hide() {
      if (!placement.visible) return
      placement.visible = false
      render()
    },
    setZoom(value: number) {
      zoom = value
      updatePlacement()
    },
    play(motion: EncounterMotion | null) {
      stop()
      const clip = asset.animations.find(item => item.name === motion)
      if (!clip) return
      const action = mixer.clipAction(clip).reset()
      if (motion !== 'talk') action.setLoop(THREE.LoopOnce, 1)
      action.play()
      let previous = performance.now()
      renderer.setAnimationLoop(now => {
        mixer.update(Math.max(0, Math.min(.1, (now - previous) / 1000)))
        previous = now
        render()
      })
    },
    render,
    dispose() {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      mixer.stopAllAction()
      mixer.uncacheRoot(asset.model)
      asset.dispose()
      shadow.geometry.dispose()
      ;(shadow.material as THREE.Material).dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
