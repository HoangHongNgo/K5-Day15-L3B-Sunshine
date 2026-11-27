import { useContext, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUp, Download, Hand, Move, Music2, Pause, RotateCcw, RotateCw, Square, MessageCircle } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createEventMascot } from './eventMascot'
import { useEvents } from '../events/EventContext'
import { defaultEventMascot, resolveEventMascot, type MascotAsset } from '../events/events'
import { MotionContext } from './Mascot'
import type { TiaMotion } from './tiaAnimations'
import './mascot3d.css'

type ViewAction = 'front' | 'back' | 'left' | 'right' | 'in' | 'out' | 'reset'

export default function Mascot3dDemo() {
  const [params] = useSearchParams()
  const { events, allMascots } = useEvents()
  const eventId = params.get('event')
  const event = events.find(item => item.id === eventId && item.status === 'published')
  if (eventId && !event) return <p role="status">Chưa có dữ liệu cho sự kiện này. <Link to="/su-kien">Xem danh sách sự kiện</Link></p>
  const mascot = event ? resolveEventMascot(allMascots, event.mascotId) : defaultEventMascot
  return <MascotModelViewer key={mascot.id} mascot={mascot} eventId={event?.id}/>
}

type ViewerMotion = TiaMotion | 'talk'
export function MascotModelViewer({ mascot, eventId }: { mascot: MascotAsset; eventId?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<(action: ViewAction) => void>(() => {})
  const spin = useRef<(enabled: boolean) => void>(() => {})
  const play = useRef<(motion: ViewerMotion | null) => void>(() => {})
  const pause = useRef<(paused: boolean) => void>(() => {})
  const { paused } = useContext(MotionContext)
  const [ready, setReady] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [motion, setMotion] = useState<ViewerMotion | null>(null)
  const [failed, setFailed] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const container = host.current!
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) }
    catch { setFailed(true); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25
    renderer.domElement.setAttribute('aria-hidden', 'true')
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(33, 1, .1, 60)
    const target = new THREE.Vector3(.15, 1.43, 0)
    const initial = new THREE.Vector3(3.5, 2.65, 6.6)
    camera.position.copy(initial)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(target)
    controls.enablePan = false
    controls.minDistance = 4.5
    controls.maxDistance = 11
    controls.minPolarAngle = .4
    controls.maxPolarAngle = Math.PI / 2 + .05
    controls.autoRotateSpeed = 1.5
    controls.update()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x928677, 2.5))
    const key = new THREE.DirectionalLight(0xffefd9, 4)
    key.position.set(-3, 7, 5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -4, far: 20 })
    key.shadow.normalBias = .025
    key.shadow.bias = -.0003
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xe9f3ff, 3)
    rim.position.set(4, 4, -3)
    scene.add(rim)
    const asset = createEventMascot(mascot)
    const mixer = new THREE.AnimationMixer(asset.model)
    scene.add(asset.model)
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.66, .16, 80), new THREE.MeshStandardMaterial({ color: '#e0cfae', roughness: .8 }))
    plinth.name = 'display-plinth'
    plinth.position.set(.15, -.09, 0)
    plinth.receiveShadow = true
    scene.add(plinth)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: .12 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -.18
    floor.receiveShadow = true
    scene.add(floor)
    function render() { renderer.render(scene, camera) }
    controls.addEventListener('change', render)
    function resize() {
      const width = container.clientWidth, height = container.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    let activeMotion: ViewerMotion | null = null
    let motionPaused = false
    function schedule() {
      let lastTime: number | null = null
      renderer.setAnimationLoop(!motionPaused && !document.hidden && (activeMotion || controls.autoRotate) ? time => {
        const delta = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, .1)
        lastTime = time
        if (activeMotion) mixer.update(delta)
        if (controls.autoRotate) controls.update(delta)
        render()
      } : null)
    }
    spin.current = enabled => {
      controls.autoRotate = enabled
      schedule()
    }
    play.current = value => {
      mixer.stopAllAction()
      activeMotion = value
      if (value) {
        mixer.clipAction(asset.animations.find(clip => clip.name === value)!).reset().play()
        mixer.update(0)
      }
      schedule()
      render()
    }
    pause.current = value => { motionPaused = value; schedule() }
    document.addEventListener('visibilitychange', schedule)
    view.current = action => {
      if (action === 'reset') { camera.position.copy(initial); controls.target.copy(target) }
      else if (action === 'front' || action === 'back') camera.position.copy(target).add(new THREE.Vector3(0, .5, action === 'front' ? 7.5 : -7.5))
      else if (action === 'left' || action === 'right') camera.position.sub(target).applyAxisAngle(new THREE.Vector3(0, 1, 0), action === 'left' ? -.4 : .4).add(target)
      else camera.position.sub(target).multiplyScalar(action === 'in' ? .85 : 1.15).add(target)
      controls.update()
      render()
    }
    function contextLost(event: Event) {
      event.preventDefault()
      renderer.setAnimationLoop(null)
      mixer.stopAllAction()
      activeMotion = null
      controls.autoRotate = false
      setFailed(true)
      setReady(false)
      setRotating(false)
      setMotion(null)
    }
    function restored() { setFailed(false); setReady(true); controls.autoRotate = false; resize() }
    renderer.domElement.addEventListener('webglcontextlost', contextLost)
    renderer.domElement.addEventListener('webglcontextrestored', restored)
    setReady(true)
    return () => {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      document.removeEventListener('visibilitychange', schedule)
      mixer.stopAllAction()
      mixer.uncacheRoot(asset.model)
      controls.dispose()
      renderer.domElement.removeEventListener('webglcontextlost', contextLost)
      renderer.domElement.removeEventListener('webglcontextrestored', restored)
      asset.dispose()
      plinth.geometry.dispose(); plinth.material.dispose()
      floor.geometry.dispose(); floor.material.dispose()
      key.shadow.map?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      view.current = () => {}
      spin.current = () => {}
      play.current = () => {}
      pause.current = () => {}
    }
  }, [mascot])

  useEffect(() => { pause.current(paused) }, [paused])

  function chooseMotion(value: ViewerMotion | null) {
    const next = value === motion ? null : value
    spin.current(false)
    setRotating(false)
    play.current(next)
    setMotion(next)
  }

  function chooseView(action: ViewAction) {
    spin.current(false)
    setRotating(false)
    view.current(action)
  }

  async function download() {
    if (!ready || exporting) return
    setExporting(true)
    setError('')
    // Export a fresh rest pose so downloading mid-jump cannot bake in a displaced body.
    const asset = createEventMascot(mascot)
    try {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
      const data = await new GLTFExporter().parseAsync(asset.model, { binary: true, animations: asset.animations })
      if (!(data instanceof ArrayBuffer)) throw new Error('Invalid GLB')
      const url = URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' }))
      const link = document.createElement('a')
      link.href = url; link.download = mascot.kind === 'tia' ? 'tia-sunshine.glb' : mascot.id + '.glb'; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('Chưa tải được mô hình. Hãy thử lại.') }
    finally { asset.dispose(); setExporting(false) }
  }

  return <section className="mascot3d-page">
    <Link to={eventId ? '/su-kien/' + eventId : '/clb/mascot'} className="mascot3d-back"><ArrowLeft size={16} />{eventId ? 'Trang sự kiện' : 'Thư viện mascot'}</Link>
    <header className="mascot3d-heading">
      <h1 tabIndex={-1}>Chào {mascot.name}, người bạn mới.</h1>
      <p>{mascot.brief || 'Chú cáo đeo khăn đỏ của Sunshine.'}</p>
    </header>
    <div className="mascot3d-layout">
      <div className="mascot3d-viewer">
      <div className="mascot3d-stage" role="region" aria-label={'Xem mascot ' + mascot.name + ' 3D'} aria-describedby="mascot3d-help" tabIndex={0}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return
          const actions: Record<string, ViewAction> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'in', ArrowDown: 'out', Home: 'reset' }
          if (actions[event.key]) { event.preventDefault(); chooseView(actions[event.key]) }
        }}>
        <div className="mascot3d-stage-top"><span>{mascot.name}</span></div>
        <div className="mascot3d-canvas" ref={host} />
        {failed && <p className="mascot3d-fallback" role="alert">Thiết bị này chưa mở được 3D. Hãy thử trình duyệt có hỗ trợ WebGL.</p>}
        <div className="mascot3d-stage-bottom">
          <p id="mascot3d-help"><Move size={16} />Kéo để xoay · Cuộn hoặc chụm để thu phóng</p>
          <span>360°</span>
        </div>
      </div>
      <div className="mascot3d-actions" role="group" aria-label={'Động tác của ' + mascot.name}>
        <button aria-pressed={motion === 'wave'} disabled={!ready || paused} onClick={() => chooseMotion('wave')}><Hand size={17} />Vẫy tay</button>
        <button aria-pressed={motion === 'jump'} disabled={!ready || paused} onClick={() => chooseMotion('jump')}><ArrowUp size={17} />Nhảy</button>
        <button aria-pressed={motion === 'dance'} disabled={!ready || paused} onClick={() => chooseMotion('dance')}><Music2 size={17} />Múa xoay</button>
        <button aria-pressed={motion === 'talk'} disabled={!ready || paused} onClick={() => chooseMotion('talk')}><MessageCircle size={17} />Mở miệng nói</button>
        <button disabled={!ready || !motion} onClick={() => chooseMotion(null)}><Square size={14} />Dừng động tác</button>
      </div>
      <p className="mascot3d-motion-status" role="status">{paused ? 'Chuyển động đang tạm dừng bằng nút trên đầu trang.' : motion ? `${mascot.name} đang ${{wave:'vẫy tay', jump:'nhảy', dance:'múa xoay', talk:'mở miệng nói'}[motion]}.` : ''}</p>
      <div className="mascot3d-controls" aria-label="Điều khiển góc nhìn">
        <div><button onClick={() => chooseView('front')} disabled={!ready}>Mặt trước</button><button onClick={() => chooseView('back')} disabled={!ready}>Mặt sau</button><button aria-label="Đặt lại góc nhìn" onClick={() => chooseView('reset')} disabled={!ready}><RotateCcw size={17} /></button></div>
        <button aria-pressed={rotating} onClick={() => { spin.current(!rotating); setRotating(!rotating) }} disabled={!ready || paused}>{rotating ? <Pause size={16} /> : <RotateCw size={16} />}Tự xoay</button>
      </div>
      </div>
      <aside className="mascot3d-details">
        <h2>Mô hình {mascot.name}</h2>
        <p>Tệp GLB chứa mô hình 3D và bốn động tác để dùng trong phần mềm hỗ trợ glTF.</p>
        <button className="mascot3d-download" onClick={() => void download()} disabled={!ready || exporting}><Download size={18} />{exporting ? 'Đang xuất mô hình…' : 'Tải mô hình .GLB'}</button>
        {error && <p role="alert">{error}</p>}
      </aside>
    </div>
    <p className="mascot3d-footnote">Bạn cũng có thể dùng phím ← → để xoay, ↑ ↓ để thu phóng và Home để đặt lại góc nhìn.</p>
  </section>
}
