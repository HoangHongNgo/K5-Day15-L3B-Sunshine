/// <reference types="webxr" />
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Box, Camera, Hand, Minus, Music2, Plus, X } from 'lucide-react'
import * as THREE from 'three'
import type { MascotAsset } from './events'
import type { EncounterMotion } from './encounterStage'
import { createEventMascot } from '../mascot/eventMascot'
import { chooseArLocomotionClip, joystickMove, joystickVector, prepareSceneForUsdz } from './mascotAr'
import { createXrLaunchGuard } from './xrLaunchGuard'
import { dataUrlToBlob, savePhoto } from './photoSave'
import './arMascot.css'

/** Chiều cao mascot trong AR (m): vừa đứng trên bàn, vẫn rõ khi đặt dưới sân. Tự ước tính; người dùng chỉnh +/-. */
const AR_HEIGHT_M = 0.45
const WALK_SPEED = 0.35

type Support = 'webxr' | 'quicklook' | null

function useArSupport(): Support {
  const [support, setSupport] = useState<Support>(null)
  useEffect(() => {
    let alive = true
    const a = document.createElement('a')
    if (a.relList?.supports?.('ar')) { setSupport('quicklook'); return }
    navigator.xr?.isSessionSupported('immersive-ar').then(ok => { if (alive && ok) setSupport('webxr') }).catch(() => {})
    return () => { alive = false }
  }, [])
  return support
}

/** Mascot đã chuẩn hoá: chân ở y = 0, giữa ở gốc, cao AR_HEIGHT_M, có bóng đổ. */
function buildArMascot(mascot: MascotAsset) {
  const asset = createEventMascot(mascot)
  const bounds = new THREE.Box3().setFromObject(asset.model)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const inner = new THREE.Group()
  asset.model.position.set(-center.x, -bounds.min.y, -center.z)
  inner.add(asset.model)
  inner.scale.setScalar(AR_HEIGHT_M / Math.max(size.y, 1e-6))
  const root = new THREE.Group()
  root.add(inner)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.5, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .3, depthWrite: false }))
  shadow.scale.setScalar(Math.max(size.x, size.z) * inner.scale.x * 1.1)
  shadow.position.y = .002
  return { root, inner, shadow, asset }
}

export function ArMascotButton({ mascot, beforeStart, onActiveChange, className = 'button button-quiet' }: {
  mascot: MascotAsset; beforeStart?: () => void; onActiveChange?: (active: boolean) => void; className?: string
}) {
  const support = useArSupport()
  if (support === 'quicklook') return <QuickLookButton mascot={mascot} beforeStart={beforeStart} className={className} />
  if (support === 'webxr') return <WebXrButton mascot={mascot} beforeStart={beforeStart} onActiveChange={onActiveChange} className={className} />
  return null
}

/** iPhone: xuất mascot ra USDZ ngay trên máy rồi mở AR Quick Look (ARKit dò bàn/sàn thật, có nút chụp sẵn). */
function QuickLookButton({ mascot, beforeStart, className }: { mascot: MascotAsset; beforeStart?: () => void; className: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true, made = ''
    void (async () => {
      const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js')
      const { root, shadow, asset } = buildArMascot(mascot)
      root.remove(shadow)
      const scene = new THREE.Scene()
      scene.add(root)
      const cleanupUsdz = prepareSceneForUsdz(scene)
      try {
        const data = await new USDZExporter().parseAsync(scene, { quickLookCompatible: true })
        if (!alive) return
        made = URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }))
        setUrl(made)
      } finally {
        cleanupUsdz()
        asset.dispose()
      }
    })().catch(() => {})
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [mascot])
  if (!url) return null
  return <button type="button" className={className} onClick={() => {
    beforeStart?.()
    const a = document.createElement('a')
    a.rel = 'ar'
    a.href = `${url}#allowsContentScaling=1`
    a.appendChild(document.createElement('img'))
    a.click()
  }}><Box size={17} />Đặt {mascot.name} vào không gian thật</button>
}

type XrUi = { surface: boolean; placed: boolean; cameraAccess: boolean; message: string }

/** Android Chrome: WebXR immersive-ar + hit-test. Chạm để đặt, joystick để đi, nút hoạt ảnh, chụp ghép camera nếu được. */
function WebXrButton({ mascot, beforeStart, onActiveChange, className }: {
  mascot: MascotAsset; beforeStart?: () => void; onActiveChange?: (active: boolean) => void; className: string
}) {
  const overlay = useRef<HTMLDivElement>(null)
  const stick = useRef({ x: 0, y: 0 })
  const ctl = useRef<{ end: () => void; play: (m: EncounterMotion) => void; scale: (k: number) => void; capture: () => void } | null>(null)
  const launchGuard = useRef<ReturnType<typeof createXrLaunchGuard> | null>(null)
  const activeCallback = useRef(onActiveChange)
  activeCallback.current = onActiveChange
  const [active, setActive] = useState(false)
  const [ui, setUi] = useState<XrUi>({ surface: false, placed: false, cameraAccess: false, message: '' })
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const guard = createXrLaunchGuard()
    launchGuard.current = guard
    return () => {
      ctl.current?.end()
      guard.dispose()
      if (launchGuard.current === guard) launchGuard.current = null
    }
  }, [])

  function start() {
    const root = overlay.current
    const guard = launchGuard.current
    if (!root || !navigator.xr || !guard || ctl.current || guard.isBusy()) return
    beforeStart?.()
    root.hidden = false
    // Gọi requestSession ngay trong lần chạm (bắt buộc).
    guard.launch(
      () => navigator.xr!.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'camera-access', 'light-estimation'],
        domOverlay: { root },
      }),
      (session, isDisposed) => runSession(session, root, isDisposed),
      {
        onActiveChange: next => activeCallback.current?.(next),
        onError: () => {
          root.hidden = true
          setActive(false)
          setUi(u => ({ ...u, message: 'Thiết bị chưa mở được AR. Hãy cập nhật Chrome và Google Play Services for AR.' }))
        },
      },
    )
  }

  async function runSession(session: XRSession, root: HTMLDivElement, isDisposed: () => boolean) {
    setActive(true)
    setUi({ surface: false, placed: false, cameraAccess: false, message: '' })
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { xrCompatible: true, alpha: true }) as WebGL2RenderingContext
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true })
    renderer.xr.enabled = true
    renderer.xr.setReferenceSpaceType('local')
    await renderer.xr.setSession(session)
    if (isDisposed()) {
      renderer.dispose()
      root.hidden = true
      return
    }
    const cameraAccess = (session.enabledFeatures ?? []).includes('camera-access')
    setUi(u => ({ ...u, cameraAccess }))

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.4))
    const sun = new THREE.DirectionalLight(0xffffff, 2)
    sun.position.set(.5, 2, 1)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera()
    const reticle = new THREE.Mesh(new THREE.RingGeometry(.07, .09, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    reticle.matrixAutoUpdate = false
    reticle.visible = false
    scene.add(reticle)
    const { root: body, inner, shadow, asset } = buildArMascot(mascot)
    body.add(shadow)
    body.visible = false
    scene.add(body)
    const mixer = new THREE.AnimationMixer(asset.model)
    const baseScale = inner.scale.x
    const shadowBase = shadow.scale.x
    let sizeK = 1
    // Chạm vào nút điều khiển không được tính là "đặt mascot".
    const guard = (e: Event) => { if ((e.target as Element | null)?.closest?.('.ar-top, .ar-bottom')) e.preventDefault() }
    root.addEventListener('beforexrselect', guard)

    const viewer = await session.requestReferenceSpace('viewer')
    const hitSource = await session.requestHitTestSource?.({ space: viewer })
    if (isDisposed()) {
      root.removeEventListener('beforexrselect', guard)
      hitSource?.cancel()
      mixer.stopAllAction()
      asset.dispose()
      renderer.dispose()
      root.hidden = true
      return
    }
    if (!hitSource) {
      root.removeEventListener('beforexrselect', guard)
      void session.end().catch(() => {})
      launchGuard.current?.markEnded()
      asset.dispose(); renderer.dispose(); root.hidden = true; setActive(false)
      setUi(u => ({ ...u, message: 'Thiết bị chưa hỗ trợ dò mặt phẳng.' }))
      return
    }
    const ref = renderer.xr.getReferenceSpace()!
    const clipNames = asset.animations.map(c => c.name)
    const hasWalkClip = clipNames.includes('walk')
    let placed = false, surface = false, captureWanted = false, last = 0, facing = 0
    let oneShotActive = false
    let currentLoopClip: 'walk' | 'idle' | null = null

    function syncLocomotion(moving: boolean) {
      const wanted = chooseArLocomotionClip({ moving, oneShotActive, clips: clipNames })
      if (!wanted || wanted === currentLoopClip) return
      const clip = asset.animations.find(c => c.name === wanted)
      if (!clip) return
      mixer.stopAllAction()
      currentLoopClip = wanted
      const action = mixer.clipAction(clip).reset()
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.play()
    }

    mixer.addEventListener('finished', () => {
      oneShotActive = false
      currentLoopClip = null
      syncLocomotion(Boolean(stick.current.x || stick.current.y))
    })

    function place() {
      if (!reticle.visible) return
      body.position.setFromMatrixPosition(reticle.matrix)
      const cam = renderer.xr.getCamera().position
      facing = Math.atan2(cam.x - body.position.x, cam.z - body.position.z)
      body.rotation.y = facing
      body.visible = true
      if (!placed) { placed = true; setUi(u => ({ ...u, placed: true })); play('wave') }
    }
    function play(motion: EncounterMotion) {
      const clip = asset.animations.find(c => c.name === motion)
      if (!clip) return
      mixer.stopAllAction()
      oneShotActive = true
      currentLoopClip = null
      const action = mixer.clipAction(clip).reset()
      action.setLoop(THREE.LoopOnce, 1)
      action.play()
    }
    const onSelect = () => place()
    session.addEventListener('select', onSelect)

    renderer.setAnimationLoop((time, frame) => {
      const dt = last ? Math.min(.1, (time - last) / 1000) : 0
      last = time
      if (frame) {
        const hits = frame.getHitTestResults(hitSource)
        const pose = hits[0]?.getPose(ref)
        reticle.visible = !!pose
        if (pose) reticle.matrix.fromArray(pose.transform.matrix)
        if (!!pose !== surface) { surface = !!pose; setUi(u => ({ ...u, surface })) }
      }
      if (placed) {
        const xrCam = renderer.xr.getCamera()
        const yaw = new THREE.Euler().setFromQuaternion(xrCam.quaternion, 'YXZ').y
        const move = joystickMove(stick.current, yaw, WALK_SPEED, dt)
        const moving = move.facing != null
        body.position.x += move.dx
        body.position.z += move.dz
        if (move.facing != null) {
          if (oneShotActive) {
            oneShotActive = false
            currentLoopClip = null
          }
          const diff = Math.atan2(Math.sin(move.facing - facing), Math.cos(move.facing - facing))
          facing += diff * Math.min(1, dt * 10)
          body.rotation.y = facing
        }
        syncLocomotion(moving)
        inner.position.y = moving && !hasWalkClip ? Math.abs(Math.sin(time / 110)) * .025 * sizeK : 0
        inner.scale.setScalar(baseScale * sizeK)
        shadow.scale.setScalar(shadowBase * sizeK)
      }
      mixer.update(dt)
      if (captureWanted && frame) { captureWanted = false; capture(frame) }
      renderer.render(scene, camera)
    })

    /** Ghép ảnh camera (WebXR Raw Camera Access) với mascot rồi lưu về máy. */
    function capture(frame: XRFrame) {
      const view = frame.getViewerPose(ref)?.views[0]
      const xrCamera = (view as XRView & { camera?: { width: number; height: number } } | undefined)?.camera
      const tex = xrCamera && renderer.xr.getCameraTexture(xrCamera as never)
      if (!view || !xrCamera || !tex) { setUi(u => ({ ...u, message: 'Máy chưa cho chụp trong AR. Hãy dùng nút chụp màn hình của điện thoại.' })); return }
      const w = xrCamera.width, h = xrCamera.height
      const rtCam = new THREE.WebGLRenderTarget(w, h)
      const rtScene = new THREE.WebGLRenderTarget(w, h)
      rtScene.texture.colorSpace = THREE.SRGBColorSpace
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex as THREE.Texture }))
      const quadScene = new THREE.Scene()
      quadScene.add(quad)
      const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      const shot = new THREE.PerspectiveCamera()
      shot.projectionMatrix.fromArray(view.projectionMatrix)
      shot.projectionMatrixInverse.copy(shot.projectionMatrix).invert()
      shot.matrixWorld.fromArray(view.transform.matrix)
      shot.matrixWorldInverse.copy(shot.matrixWorld).invert()
      shot.matrixAutoUpdate = false
      const prevTarget = renderer.getRenderTarget()
      renderer.xr.enabled = false
      reticle.visible = false
      try {
        renderer.setRenderTarget(rtCam); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(quadScene, ortho)
        renderer.setRenderTarget(rtScene); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, shot)
        const a = new Uint8Array(w * h * 4), b = new Uint8Array(w * h * 4)
        renderer.readRenderTargetPixels(rtCam, 0, 0, w, h, a)
        renderer.readRenderTargetPixels(rtScene, 0, 0, w, h, b)
        const out = document.createElement('canvas')
        out.width = w; out.height = h
        const ctx = out.getContext('2d')!
        const layer = (px: Uint8Array) => {
          const c = document.createElement('canvas'); c.width = w; c.height = h
          const img = new ImageData(w, h)
          for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4)
          c.getContext('2d')!.putImageData(img, 0, 0)
          return c
        }
        ctx.drawImage(layer(a), 0, 0)
        ctx.drawImage(layer(b), 0, 0)
        const dataUrl = out.toDataURL('image/jpeg', .9)
        void savePhoto(dataUrlToBlob(dataUrl), `wayfinder-ar-${Date.now()}.jpg`).then(r =>
          setUi(u => ({ ...u, message: r === 'downloaded' ? 'Ảnh đã tải về máy.' : r === 'shared' ? 'Chọn Ảnh/Lưu để lưu ảnh.' : '' })))
      } catch {
        setUi(u => ({ ...u, message: 'Chưa chụp được trong AR. Hãy dùng nút chụp màn hình của điện thoại.' }))
      } finally {
        renderer.setRenderTarget(prevTarget)
        renderer.xr.enabled = true
        rtCam.dispose(); rtScene.dispose(); quad.geometry.dispose(); (quad.material as THREE.Material).dispose()
      }
    }

    ctl.current = {
      end: () => { void session.end().catch(() => {}) },
      play,
      scale: k => { sizeK = Math.min(3, Math.max(.4, sizeK * k)) },
      capture: () => { captureWanted = true },
    }
    session.addEventListener('end', () => {
      renderer.setAnimationLoop(null)
      session.removeEventListener('select', onSelect)
      root.removeEventListener('beforexrselect', guard)
      hitSource.cancel()
      mixer.stopAllAction()
      asset.dispose()
      renderer.dispose()
      ctl.current = null
      launchGuard.current?.markEnded()
      root.hidden = true
      stick.current = { x: 0, y: 0 }
      setKnob({ x: 0, y: 0 })
      setActive(false)
    }, { once: true })
  }

  function onStick(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const radius = r.width / 2
    const dx = e.clientX - (r.left + radius), dy = e.clientY - (r.top + radius)
    stick.current = joystickVector(dx, dy, radius)
    setKnob({ x: stick.current.x * radius * .6, y: stick.current.y * radius * .6 })
  }
  function releaseStick() { stick.current = { x: 0, y: 0 }; setKnob({ x: 0, y: 0 }) }

  return <>
    <button type="button" className={className} onClick={start}><Box size={17} />Đặt {mascot.name} vào không gian thật</button>
    {!active && ui.message && <p role="status">{ui.message}</p>}
    {createPortal(<div ref={overlay} className="ar-overlay" hidden>
      {active && <>
        <div className="ar-top">
          <button type="button" className="ar-round" aria-label="Thoát AR" onClick={() => ctl.current?.end()}><X size={22} /></button>
          <p className="ar-hint" role="status">{ui.message || (!ui.placed ? (ui.surface ? `Chạm để đặt ${mascot.name} lên mặt phẳng` : 'Di chuyển điện thoại chậm để dò mặt bàn hoặc mặt sàn…') : 'Kéo joystick để đi, chạm chỗ khác để đặt lại')}</p>
        </div>
        {ui.placed && <div className="ar-bottom">
          <div className="ar-stick" aria-label="Joystick di chuyển mascot" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onStick(e) }}
            onPointerMove={e => { if (e.buttons) onStick(e) }} onPointerUp={releaseStick} onPointerCancel={releaseStick}>
            <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
          </div>
          <div className="ar-actions">
            <button type="button" className="ar-round" aria-label="Vẫy tay" onClick={() => ctl.current?.play('wave')}><Hand size={20} /></button>
            <button type="button" className="ar-round" aria-label="Nhảy" onClick={() => ctl.current?.play('jump')}><ArrowUp size={20} /></button>
            <button type="button" className="ar-round" aria-label="Nhảy múa" onClick={() => ctl.current?.play('dance')}><Music2 size={20} /></button>
            <button type="button" className="ar-round" aria-label="Thu nhỏ" onClick={() => ctl.current?.scale(.8)}><Minus size={20} /></button>
            <button type="button" className="ar-round" aria-label="Phóng to" onClick={() => ctl.current?.scale(1.25)}><Plus size={20} /></button>
            {ui.cameraAccess && <button type="button" className="ar-round ar-shutter" aria-label={`Chụp ảnh cùng ${mascot.name}`} onClick={() => ctl.current?.capture()}><Camera size={24} /></button>}
          </div>
        </div>}
      </>}
    </div>, document.body)}
  </>
}
