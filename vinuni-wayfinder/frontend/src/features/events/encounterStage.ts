import * as THREE from 'three'
import type { MascotAsset } from './events'
import { createEventMascot } from '../mascot/eventMascot'
import { createMascotPatrol, resetMascotPatrol, stepMascotPatrol } from '../mascot/tiaAnimations'

export type EncounterMotion = 'walk' | 'wave' | 'jump' | 'dance' | 'talk'

/** Bật/tắt chế độ đi bộ tuần tra; gọi động tác khác sẽ tự kết thúc vòng đi bộ. */
export function toggleEncounterMotion(
  activeLoop: 'walk' | null,
  motion: EncounterMotion,
): { nextLoop: 'walk' | null; play: EncounterMotion | null } {
  if (motion === 'walk') {
    return activeLoop === 'walk' ? { nextLoop: null, play: null } : { nextLoop: 'walk', play: 'walk' }
  }
  return { nextLoop: null, play: motion }
}

export function createEncounterMotionRunner(options: {
  model: THREE.Object3D
  animations: readonly THREE.AnimationClip[]
  mixer: THREE.AnimationMixer
  setLoop: (cb: ((now: number) => void) | null) => void
  render: () => void
  clampX?: (rawX: number) => number
  onWalkStep?: () => void
}) {
  const { model, animations, mixer, setLoop, render, clampX, onWalkStep } = options
  const patrol = createMascotPatrol(0.24, 0.12, 1.15)
  let current: EncounterMotion | 'idle' | null = null
  let allowIdle = false

  function startLoop(mode: EncounterMotion | 'idle') {
    current = mode
    let previous = performance.now()
    setLoop(now => {
      const delta = Math.max(0, Math.min(.1, (now - previous) / 1000))
      previous = now
      mixer.update(delta)
      if (current === 'walk') {
        stepMascotPatrol(model, patrol, delta)
        if (clampX) model.position.x = clampX(model.position.x)
        onWalkStep?.()
      }
      render()
    })
  }

  function playIdleIfAllowed() {
    const idleClip = allowIdle ? animations.find(item => item.name === 'idle') : undefined
    if (!idleClip) {
      current = null
      setLoop(null)
      render()
      return
    }
    mixer.stopAllAction()
    resetMascotPatrol(model, patrol)
    mixer.clipAction(idleClip).reset().play()
    startLoop('idle')
  }

  function stop() {
    current = null
    setLoop(null)
    mixer.stopAllAction()
    resetMascotPatrol(model, patrol)
    render()
  }

  const onFinished = () => playIdleIfAllowed()
  mixer.addEventListener('finished', onFinished)

  return {
    hasMotion(motion: EncounterMotion) {
      return animations.some(item => item.name === motion)
    },
    currentMotion() {
      return current
    },
    setIdle(enabled: boolean) {
      allowIdle = enabled
      if (!enabled && current === 'idle') stop()
      else if (enabled && current === null) playIdleIfAllowed()
    },
    play(motion: EncounterMotion | null) {
      if (!motion) {
        stop()
        playIdleIfAllowed()
        return
      }
      const clip = animations.find(item => item.name === motion)
      if (!clip) return
      stop()
      const action = mixer.clipAction(clip).reset()
      if (motion !== 'talk' && motion !== 'walk') action.setLoop(THREE.LoopOnce, 1)
      action.play()
      startLoop(motion)
    },
    stop,
    dispose() {
      mixer.removeEventListener('finished', onFinished)
      setLoop(null)
      mixer.stopAllAction()
    },
  }
}

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

/** Giữ bước đi dạo trong khung camera kể cả khi mascot đang neo ở góc phải dưới (x = 0.72). */
export function clampStageWalkX(rawModelX: number, frameX: number, scale: number, viewportWidth: number, modelWidth: number) {
  if (scale <= 0) return 0
  const halfRoomPx = Math.max(0, (viewportWidth - scale * modelWidth) / 2)
  const minModelX = (-halfRoomPx - frameX) / scale
  const maxModelX = (halfRoomPx - frameX) / scale
  return THREE.MathUtils.clamp(rawModelX, minModelX, maxModelX)
}

/** Đồng bộ vị trí ngang và độ mờ/độ rộng bóng đổ dưới chân khi mascot đi bộ hoặc nhảy lên cao. */
export function contactShadowState(modelX: number, modelY: number) {
  const lift = Math.max(0, modelY)
  const factor = 1 / (1 + lift * 0.85)
  return {
    x: modelX,
    scaleFactor: factor,
    opacity: 0.28 * factor,
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
  // Bóng đổ dẹt dưới chân để mascot trông như đứng trên sàn và đi theo chân khi di chuyển.
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false })
  const shadowBaseX = size.x * .95
  const shadowBaseY = Math.max(size.x * .16, size.y * .035)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.5, 40), shadowMat)
  shadow.scale.set(shadowBaseX, shadowBaseY, 1)
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
  let currentFrame = { x: 0, y: 0, scale: 1 }

  function syncShadow() {
    const st = contactShadowState(asset.model.position.x, asset.model.position.y)
    shadow.position.x = st.x
    shadow.scale.set(shadowBaseX * st.scaleFactor, shadowBaseY * st.scaleFactor, 1)
    shadowMat.opacity = st.opacity
  }

  function render() {
    syncShadow()
    renderer.render(scene, camera)
  }

  function updatePlacement() {
    const { clientWidth: w, clientHeight: h } = canvas
    if (!w || !h) return
    currentFrame = frameMascot(w, h, size.x, size.y, x, y, zoom)
    placement.scale.setScalar(currentFrame.scale)
    placement.position.set(currentFrame.x, currentFrame.y, 0)
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
  const runner = createEncounterMotionRunner({
    model: asset.model,
    animations: asset.animations,
    mixer,
    setLoop: cb => renderer.setAnimationLoop(cb),
    render,
    onWalkStep: () => {
      if (canvas.clientWidth > 0) {
        asset.model.position.x = clampStageWalkX(
          asset.model.position.x,
          currentFrame.x,
          currentFrame.scale,
          canvas.clientWidth,
          size.x,
        )
      }
    },
  })
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
    hasMotion: runner.hasMotion,
    setIdle: runner.setIdle,
    play: runner.play,
    render,
    dispose() {
      observer.disconnect()
      runner.dispose()
      mixer.uncacheRoot(asset.model)
      asset.dispose()
      shadow.geometry.dispose()
      shadowMat.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
