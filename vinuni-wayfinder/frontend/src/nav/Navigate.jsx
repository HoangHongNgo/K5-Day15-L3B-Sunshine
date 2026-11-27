import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { prepPhoto } from '../lib/image.js'
import { matchRooms } from '../lib/text.js'
import { bearingDeg, distanceM } from '../lib/geo.js'
import { requestSensorPermission, useCompass, useGeolocation, useStepCounter, STEP_LENGTH_M } from '../lib/sensors.js'

// Luồng: chọn điểm đến -> chọn cách xác định vị trí -> (chụp ảnh -> xác nhận / ảnh thứ 2) -> thẻ chỉ dẫn
export default function Navigate() {
  const [rooms, setRooms] = useState([])
  const [outdoorGeo, setOutdoorGeo] = useState(false)
  const [dest, setDest] = useState(null)
  const [screen, setScreen] = useState('dest')
  const [loc, setLoc] = useState(null)        // kết quả /api/locate
  const [route, setRoute] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    api.destinations().then((d) => { setRooms(d.rooms); setOutdoorGeo(d.outdoorGeo) }).catch((e) => setError(e.message))
  }, [])

  const reset = () => { setScreen('dest'); setDest(null); setLoc(null); setRoute(null); setError(null) }

  async function go(params, startLabel) {
    setBusy('Đang tìm đường…')
    setError(null)
    try {
      const r = await api.route({ to: dest.id, ...params })
      setRoute({ ...r, startLabel: startLabel || r.start })
      setScreen('route')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function snap(file, previous) {
    if (!file) return
    setScreen('locating')
    setError(null)
    try {
      const blob = await prepPhoto(file)
      const r = await api.locate(blob, previous)
      setLoc(r)
      if (r.tier === 'auto') await go({ start: r.spot }, r.label)
      else setScreen(r.tier === 'second' ? 'second' : 'confirm')
    } catch (e) {
      setError(e.message)
      setScreen('start')
    }
  }

  async function confirmSpot(spot, label) {
    if (loc?.photoId) api.correct(loc.photoId, spot).catch(() => {}) // học từ lựa chọn của người dùng
    await go({ start: spot }, label)
  }

  return (
    <div className="nav">
      <Stepper screen={screen} />
      {error && <div className="alert">{error}</div>}
      {busy && <div className="busy">{busy}</div>}
      {screen === 'dest' && <DestPicker rooms={rooms} onPick={(r) => { setDest(r); setScreen('start') }} />}
      {screen === 'start' && dest && (
        <StartPicker dest={dest} outdoorGeo={outdoorGeo} onBack={reset} onSnap={(f) => snap(f)}
          onGps={(p) => go({ lat: p.lat, lng: p.lng }, 'Vị trí GPS của bạn')}
          onManual={() => setScreen('manual')} />
      )}
      {screen === 'locating' && <div className="card center"><div className="spinner" /><p>Đang nhận diện vị trí…</p></div>}
      {screen === 'confirm' && loc && (
        <Confirm loc={loc} onPick={confirmSpot} onManual={() => setScreen('manual')} onRetake={(f) => snap(f)} />
      )}
      {screen === 'second' && loc && (
        <SecondPhoto onSnap={(f) => snap(f, loc.photoId)} onManual={() => setScreen('manual')}
          onShowGuesses={() => setScreen('confirm')} />
      )}
      {screen === 'manual' && (
        <ManualStart rooms={rooms} onPickRoom={(r) => go({ start: r.id }, r.name)}
          onPickSpot={(s) => confirmSpot(s.spot, s.label)} onBack={() => setScreen('start')} />
      )}
      {screen === 'route' && route && (
        <Route route={route} dest={dest} loc={loc} onDone={reset}
          onRelocate={() => { setRoute(null); setLoc(null); setScreen('start') }}
          onNotHere={() => setScreen('confirm')} />
      )}
    </div>
  )
}

function Stepper({ screen }) {
  const idx = { dest: 0, start: 1, manual: 1, locating: 2, confirm: 2, second: 2, route: 3 }[screen] ?? 0
  const labels = ['Điểm đến', 'Vị trí', 'Xác nhận', 'Đi thôi']
  return (
    <ol className="stepper">
      {labels.map((l, i) => <li key={l} className={i === idx ? 'on' : i < idx ? 'done' : ''}><span>{i + 1}</span>{l}</li>)}
    </ol>
  )
}

function DestPicker({ rooms, onPick }) {
  const [q, setQ] = useState('')
  const list = matchRooms(rooms, q)
  return (
    <div>
      <h2>Bạn muốn đến đâu?</h2>
      <input className="search" autoFocus placeholder="Gõ số phòng hoặc tên (vd: I109, y tế, cà phê)" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="list">
        {list.map((r) => (
          <li key={r.id}><button onClick={() => onPick(r)}>
            <b>{r.code ? `${r.code} · ` : ''}{r.name}</b>
            {r.building && <small>{r.building}</small>}
          </button></li>
        ))}
        {!list.length && <li className="muted">Không tìm thấy “{q}”.</li>}
      </ul>
    </div>
  )
}

function PhotoButton({ children, onFile, className = 'btn primary big' }) {
  const ref = useRef()
  return (
    <>
      <button className={className} onClick={() => ref.current.click()}>{children}</button>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f) }} />
    </>
  )
}

function StartPicker({ dest, outdoorGeo, onBack, onSnap, onGps, onManual }) {
  const [gpsOn, setGpsOn] = useState(false)
  const { pos, error } = useGeolocation(gpsOn)
  useEffect(() => {
    if (gpsOn && pos && pos.acc <= 40) { setGpsOn(false); onGps(pos) }
  }, [gpsOn, pos])
  return (
    <div>
      <p className="dest">Đến: <b>{dest.name}</b> <button className="link" onClick={onBack}>Đổi</button></p>
      <h2>Bạn đang ở đâu?</h2>
      <div className="stack">
        <PhotoButton onFile={onSnap}>📷 Chụp ảnh hành lang trước mặt<small>Khi đang ở trong Tòa I</small></PhotoButton>
        <button className="btn big" disabled={!outdoorGeo} onClick={() => setGpsOn(true)}>
          📍 Dùng GPS<small>{outdoorGeo ? 'Khi đang ở ngoài trời' : 'Bản đồ ngoài trời chưa neo GPS'}</small>
        </button>
        {gpsOn && <p className="muted">{error || (pos ? `Đang chờ GPS chính xác hơn (±${Math.round(pos.acc)} m)…` : 'Đang lấy vị trí…')}</p>}
        <button className="btn big" onClick={onManual}>⌨️ Gõ số phòng gần bạn<small>Không cần camera hay GPS</small></button>
      </div>
      <PhotoTips />
    </div>
  )
}

function PhotoTips() {
  return (
    <details className="tips">
      <summary>Mẹo chụp ảnh để nhận diện đúng</summary>
      <ul>
        <li>Đứng giữa hành lang, cầm máy ngang tầm ngực, chụp dọc theo hành lang.</li>
        <li>Tránh chụp sát tường trơn hoặc chỉ thấy người.</li>
        <li>Nếu có biển số phòng, cho biển vào khung hình.</li>
      </ul>
      <p className="muted">Ảnh được thu nhỏ và xoá thông tin vị trí trên máy, rồi xoá ngay sau khi nhận diện.</p>
    </details>
  )
}

function Confirm({ loc, onPick, onManual, onRetake }) {
  return (
    <div>
      <h2>Bạn đang ở chỗ nào?</h2>
      <p className="muted">Mình chưa chắc chắn ({Math.round(loc.confidence * 100)}%). Chạm vào chỗ đúng — lần sau mình sẽ nhận ra nhanh hơn.</p>
      <ul className="list">
        {loc.top3.map((t) => (
          <li key={t.spot}><button onClick={() => onPick(t.spot, t.label)}><b>{t.label}</b></button></li>
        ))}
      </ul>
      <div className="row">
        <PhotoButton onFile={onRetake} className="btn">Chụp lại</PhotoButton>
        <button className="btn" onClick={onManual}>Không có ở đây</button>
      </div>
    </div>
  )
}

function SecondPhoto({ onSnap, onManual, onShowGuesses }) {
  return (
    <div className="card center">
      <h2>Chụp thêm một ảnh</h2>
      <p>Mình chưa nhận ra chỗ này. Hãy <b>quay người sang hướng khác</b> (vd. nhìn ngược lại hành lang) rồi chụp thêm một ảnh.</p>
      <PhotoButton onFile={onSnap}>📷 Chụp ảnh thứ hai</PhotoButton>
      <div className="row">
        <button className="btn" onClick={onShowGuesses}>Xem các phỏng đoán</button>
        <button className="btn" onClick={onManual}>Gõ số phòng</button>
      </div>
    </div>
  )
}

function ManualStart({ rooms, onPickRoom, onPickSpot, onBack }) {
  const [q, setQ] = useState('')
  const [spots, setSpots] = useState([])
  useEffect(() => {
    const t = setTimeout(() => api.spotSearch(q).then((d) => setSpots(d.spots)).catch(() => {}), 200)
    return () => clearTimeout(t)
  }, [q])
  const list = matchRooms(rooms, q).slice(0, 8)
  return (
    <div>
      <h2>Bạn đang đứng gần đâu?</h2>
      <input className="search" autoFocus placeholder="Số phòng hoặc chỗ gần bạn" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="list">
        {list.map((r) => <li key={'r' + r.id}><button onClick={() => onPickRoom(r)}><b>{r.code ? `${r.code} · ` : ''}{r.name}</b></button></li>)}
        {spots.slice(0, 8).map((s) => <li key={'s' + s.spot}><button onClick={() => onPickSpot(s)}>{s.label}</button></li>)}
      </ul>
      <button className="link" onClick={onBack}>← Quay lại</button>
    </div>
  )
}

// ---------------- thẻ chỉ dẫn ----------------
function Route({ route, dest, loc, onDone, onRelocate, onNotHere }) {
  const [i, setI] = useState(0)
  const [sensors, setSensors] = useState(false)
  const steps = route.steps
  const step = steps[i]
  const outdoor = step.mapKind === 'outdoor' && step.kind === 'walk' && step.target.lat != null
  const { pos } = useGeolocation(outdoor)
  const heading = useCompass(sensors)
  const [count, resetCount] = useStepCounter(sensors && step.mapKind === 'indoor' && step.kind === 'walk')

  useEffect(() => { resetCount() }, [i])

  // ngoài trời: tự sang bước sau khi tới gần mốc
  const dist = outdoor && pos ? distanceM(pos, step.target) : null
  useEffect(() => {
    if (dist != null && dist < Math.max(8, Math.min(pos.acc, 20)) && i < steps.length - 1) setI(i + 1)
  }, [dist])

  const walked = count * STEP_LENGTH_M
  const next = () => setI((k) => Math.min(k + 1, steps.length - 1))
  const prev = () => setI((k) => Math.max(k - 1, 0))
  const arrow = outdoor && pos ? bearingDeg(pos, step.target) - (heading ?? 0) : null

  return (
    <div className="route">
      <p className="dest">Từ <b>{route.startLabel}</b> đến <b>{dest.name}</b> · {route.totalMeters} m, ~{Math.max(1, Math.round(route.estSeconds / 60))} phút</p>
      {loc?.tier === 'auto' && i === 0 && <button className="link" onClick={onNotHere}>Không phải ở đây?</button>}

      <div className={`stepcard ${step.kind}`}>
        <div className="count">Bước {i + 1}/{steps.length}</div>
        {step.kind === 'arrive' ? <div className="big-ico">🎉</div>
          : step.kind === 'door' ? <div className="big-ico">🚪</div>
          : outdoor && pos ? (
            <div className="compass" style={{ transform: `rotate(${arrow}deg)` }} aria-hidden>➤</div>
          ) : <div className="big-ico">{turnIcon(step.text)}</div>}
        <p className="instr">{step.text}</p>
        {outdoor && dist != null && <p className="live">Còn {Math.round(dist)} m tới {step.target.label} {heading == null && sensors ? '(máy không có la bàn)' : ''}</p>}
        {outdoor && !pos && <p className="muted">Đang chờ GPS…</p>}
        {step.mapKind === 'indoor' && step.kind === 'walk' && sensors && (
          <p className="live">Đã đi ~{Math.round(walked)} m / {Math.round(step.meters)} m</p>
        )}
        {step.passes?.length > 0 && (
          <p className="passes">Bạn sẽ đi qua: {step.passes.map((p) => `${p.name} (${p.side})`).join(', ')}</p>
        )}
        {step.approx && step.kind === 'walk' && <p className="muted small">Khoảng cách ước tính, chưa đo bằng GPS.</p>}
      </div>

      {!sensors && step.kind !== 'arrive' && (
        <button className="btn" onClick={async () => { await requestSensorPermission(); setSensors(true) }}>
          🧭 Bật la bàn &amp; đếm bước
        </button>
      )}

      <div className="row">
        <button className="btn" disabled={i === 0} onClick={prev}>← Trước</button>
        {step.kind === 'arrive'
          ? <button className="btn primary" onClick={onDone}>Xong</button>
          : <button className="btn primary" onClick={next}>Tiếp →</button>}
      </div>
      {step.mapKind === 'indoor' && step.kind !== 'arrive' && (
        <button className="link" onClick={onRelocate}>Lạc đường? Chụp ảnh để định vị lại</button>
      )}
    </div>
  )
}

function turnIcon(text) {
  if (text.startsWith('Rẽ trái')) return '⬅️'
  if (text.startsWith('Rẽ phải')) return '➡️'
  if (text.startsWith('Quay lại')) return '↩️'
  return '⬆️'
}
