import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { fitTransform } from '../../shared/lib/geo.js'
import { averageGps, requestSensorPermission, useCompass, useStepCounter } from '../../shared/lib/sensors.js'

const TYPES = {
  hallway: 'Hành lang / sảnh', junction: 'Ngã rẽ', entrance: 'Cửa ra vào', room: 'Phòng',
  landmark: 'Mốc (thang máy, quầy…)', gate: 'Cổng',
}
const COLORS = { hallway: '#3b82f6', junction: '#64748b', entrance: '#f59e0b', room: '#16a34a', landmark: '#a855f7', gate: '#dc2626' }
const TOOLS = [['select', 'Chọn / kéo'], ['add', '+ Điểm'], ['link', 'Nối'], ['anchor', 'Neo GPS'], ['delete', 'Xoá']]

export default function Collect() {
  const [site, setSite] = useState(null)
  const [mapId, setMapId] = useState('G')
  const [tool, setTool] = useState('select')
  const [sel, setSel] = useState(null)
  const [linkFrom, setLinkFrom] = useState(null)
  const [pendingAnchor, setPendingAnchor] = useState(null)
  const [zoom, setZoom] = useState(0.45)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState(null)
  const [spots, setSpots] = useState({ counts: {}, thumbs: {} })
  const [showTraces, setShowTraces] = useState(true)

  const load = () => api.site().then((s) => { setSite(s); setDirty(false) }).catch((e) => setMsg(e.message))
  const loadSpots = () => api.spots().then(setSpots).catch(() => {})
  useEffect(() => { load(); loadSpots() }, [])
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const map = site?.maps.find((m) => m.id === mapId) || site?.maps[0]
  const tf = useMemo(() => (map ? fitTransform(map.anchors) : null), [map])

  if (!site) return <div className="card">{msg || 'Đang tải dữ liệu…'}</div>

  // ---- sửa dữ liệu ----
  const update = (fn) => { setSite((s) => { const c = structuredClone(s); fn(c); return c }); setDirty(true) }
  const nodesHere = site.nodes.filter((n) => n.map === mapId)
  const selNode = site.nodes.find((n) => n.id === sel)
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(null), 3500) }

  async function save() {
    try {
      const { mapInfo, ...clean } = site
      await api.saveSite(clean)
      await load()
      flash('Đã lưu')
    } catch (e) { flash(e.message) }
  }

  function onMapClick(x, y) {
    if (tool === 'add') {
      const id = `${mapId}_${Date.now().toString(36)}`
      update((s) => s.nodes.push({ id, map: mapId, x: Math.round(x), y: Math.round(y), type: 'hallway', label: 'Điểm mới', verified: true }))
      setSel(id)
    } else if (tool === 'anchor') {
      setPendingAnchor({ x: Math.round(x), y: Math.round(y) })
    } else {
      setSel(null)
    }
  }

  function onNodeClick(id) {
    if (tool === 'anchor') {
      // chạm vào một điểm có sẵn (vd. cửa ra vào) -> neo đúng toạ độ điểm đó
      const n = site.nodes.find((k) => k.id === id)
      setSel(null)
      setPendingAnchor({ x: n.x, y: n.y, node: id, label: n.label })
      return
    }
    if (tool === 'link') {
      if (!linkFrom) { setLinkFrom(id); return }
      if (linkFrom !== id) {
        update((s) => {
          const i = s.edges.findIndex((e) => (e.a === linkFrom && e.b === id) || (e.a === id && e.b === linkFrom))
          if (i >= 0) s.edges.splice(i, 1)
          else s.edges.push({ a: linkFrom, b: id, kind: 'walk', verified: true })
        })
      }
      setLinkFrom(id) // nối tiếp chuỗi: chạm điểm kế tiếp
    } else if (tool === 'delete') {
      if (!confirm('Xoá điểm này và các đường nối của nó?')) return
      update((s) => {
        s.nodes = s.nodes.filter((n) => n.id !== id)
        s.edges = s.edges.filter((e) => e.a !== id && e.b !== id)
        s.rooms = s.rooms.filter((r) => r.node !== id)
      })
      if (sel === id) setSel(null)
    } else {
      setSel(id)
    }
  }

  return (
    <div className="collect">
      <div className="toolbar">
        <select value={mapId} onChange={(e) => { setMapId(e.target.value); setSel(null); setLinkFrom(null) }}>
          {site.maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {TOOLS.map(([k, l]) => (
          <button key={k} className={'chip' + (tool === k ? ' on' : '')} onClick={() => { setTool(k); setLinkFrom(null); setPendingAnchor(null) }}>{l}</button>
        ))}
        <span className="grow" />
        <button className="chip" onClick={() => setZoom((z) => Math.max(0.15, z / 1.3))}>−</button>
        <button className="chip" onClick={() => setZoom((z) => Math.min(3, z * 1.3))}>+</button>
        <button className={'btn primary small' + (dirty ? '' : ' ghost')} onClick={save}>{dirty ? 'Lưu*' : 'Đã lưu'}</button>
      </div>
      {msg && <div className="alert">{msg}</div>}
      {tool === 'link' && <p className="hint">{linkFrom ? `Đang nối từ “${site.nodes.find((n) => n.id === linkFrom)?.label}”. Chạm điểm tiếp theo (chạm lại cạnh đã có để xoá).` : 'Chạm điểm đầu tiên.'}</p>}
      {tool === 'anchor' && !pendingAnchor && <p className="hint">Chạm vào chỗ bạn đang đứng trên sơ đồ — chạm thẳng vào chấm cửa ra vào (màu cam) là tiện nhất.</p>}

      <MapCanvas map={map} site={site} nodes={nodesHere} zoom={zoom} sel={sel} linkFrom={linkFrom}
        pendingAnchor={pendingAnchor} tf={tf} showTraces={showTraces} counts={spots.counts}
        onMapClick={onMapClick} onNodeClick={onNodeClick}
        onDrag={tool === 'select' ? (id, x, y) => update((s) => { const n = s.nodes.find((k) => k.id === id); n.x = Math.round(x); n.y = Math.round(y) }) : null} />

      <div className="panel">
        {pendingAnchor && (
          <AnchorCapture point={pendingAnchor} onCancel={() => setPendingAnchor(null)}
            onDone={(g) => { update((s) => s.maps.find((m) => m.id === mapId).anchors.push({ ...pendingAnchor, ...g, t: Date.now() })); setPendingAnchor(null); flash('Đã thêm neo — nhớ bấm Lưu') }} />
        )}
        {selNode ? (
          <NodePanel key={selNode.id} node={selNode} site={site} map={map} update={update} spots={spots}
            reloadSpots={loadSpots} flash={flash} onClose={() => setSel(null)} />
        ) : (
          <MapPanel map={map} site={site} update={update} info={site.mapInfo?.[mapId]} counts={spots.counts}
            onSelect={setSel} reload={load} flash={flash} showTraces={showTraces} setShowTraces={setShowTraces} dirty={dirty} />
        )}
      </div>
    </div>
  )
}

function MapCanvas({ map, site, nodes, zoom, sel, linkFrom, pendingAnchor, tf, showTraces, counts, onMapClick, onNodeClick, onDrag }) {
  const svgRef = useRef()
  const drag = useRef(null)
  const [imgOk, setImgOk] = useState(true)
  const W = map.width, H = map.height
  const r = 9 / zoom
  const byId = Object.fromEntries(site.nodes.map((n) => [n.id, n]))
  const toPx = (e) => {
    const b = svgRef.current.getBoundingClientRect()
    return [((e.clientX - b.left) / b.width) * W, ((e.clientY - b.top) / b.height) * H]
  }
  const edges = site.edges.filter((e) => byId[e.a]?.map === map.id && byId[e.b]?.map === map.id)
  const doorNodes = new Set(site.edges.filter((e) => byId[e.a] && byId[e.b] && byId[e.a].map !== byId[e.b].map).flatMap((e) => [e.a, e.b]))
  const traces = showTraces && tf ? (site.traces || []).map((t) => t.points.filter((p) => p.lat != null).map((p) => tf.toPx(p.lat, p.lng))) : []

  return (
    <div className="canvas">
      <div className="sheet" style={{ width: W * zoom, height: H * zoom }}>
        {imgOk && <img src={map.image} alt="" draggable={false} onError={() => setImgOk(false)} />}
        {!imgOk && <div className="noimg">Chưa có ảnh sơ đồ — tải ảnh lên ở bảng bên dưới</div>}
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
          onClick={(e) => { if (e.target === svgRef.current) onMapClick(...toPx(e)) }}
          onPointerMove={(e) => { if (drag.current && onDrag) { const [x, y] = toPx(e); onDrag(drag.current, x, y) } }}
          onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
          {traces.map((pts, i) => <polyline key={i} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="trace" strokeWidth={3 / zoom} />)}
          {edges.map((e, i) => {
            const a = byId[e.a], b = byId[e.b]
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={'edge' + (e.verified ? '' : ' unverified')} strokeWidth={4 / zoom} />
          })}
          {(map.anchors || []).map((a, i) => (
            <g key={'a' + i} transform={`translate(${a.x},${a.y})`}>
              <path d={`M0 ${-r * 1.6} L${r * 1.3} ${r} L${-r * 1.3} ${r}Z`} className="anchor" strokeWidth={2 / zoom} />
            </g>
          ))}
          {pendingAnchor && <circle cx={pendingAnchor.x} cy={pendingAnchor.y} r={r * 1.8} className="pending" strokeWidth={3 / zoom} />}
          {nodes.map((n) => (
            <g key={n.id} onPointerDown={(e) => { e.stopPropagation(); if (onDrag) { drag.current = n.id; e.currentTarget.setPointerCapture?.(e.pointerId) } }}
              onClick={(e) => { e.stopPropagation(); onNodeClick(n.id) }} style={{ touchAction: onDrag ? 'none' : 'auto', cursor: 'pointer' }}>
              <circle cx={n.x} cy={n.y} r={r * 2.2} fill="transparent" />
              <circle cx={n.x} cy={n.y} r={r} fill={COLORS[n.type] || '#888'}
                stroke={n.id === sel || n.id === linkFrom ? '#111' : n.verified ? '#fff' : '#fca5a5'} strokeWidth={(n.id === sel || n.id === linkFrom ? 4 : 2) / zoom} />
              {doorNodes.has(n.id) && <circle cx={n.x} cy={n.y} r={r * 1.5} fill="none" stroke="#f59e0b" strokeDasharray={`${3 / zoom}`} strokeWidth={2 / zoom} />}
              {counts[n.id]?.frames > 0 && <text x={n.x + r} y={n.y - r} className="badge" fontSize={11 / zoom}>📷{counts[n.id].frames}</text>}
              {(zoom >= 0.7 || n.id === sel || n.id === linkFrom) && <text x={n.x} y={n.y + r * 2.4} className="nlabel" fontSize={11 / zoom}>{n.label}</text>}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

function AnchorCapture({ point, onCancel, onDone }) {
  const [state, setState] = useState(null)
  const boxRef = useRef()
  // trên điện thoại bảng nằm dưới sơ đồ: cuộn tới để thấy nút Ghi GPS
  useEffect(() => { boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [point.x, point.y])
  async function capture() {
    setState({ busy: true, n: 0 })
    try {
      const g = await averageGps({ samples: 10, onProgress: (n, acc) => setState({ busy: true, n, acc }) })
      onDone(g)
    } catch (e) { setState({ error: e.message }) }
  }
  return (
    <div className="box anchorbox" ref={boxRef}>
      <b>Neo GPS tại {point.label ? `“${point.label}”` : `điểm (${point.x}, ${point.y})`}</b>
      <p className="muted">Đứng đúng chỗ đã chạm, ở ngoài trời hoặc sát cửa, giữ yên máy khoảng 10–20 giây.</p>
      {state?.busy && <p>Đang đo GPS… {state.n} lần{state.acc ? `, ±${Math.round(state.acc)} m` : ''}</p>}
      {state?.error && <p className="alert">{state.error}</p>}
      <div className="row"><button className="btn primary" disabled={state?.busy} onClick={capture}>Ghi GPS</button><button className="btn" onClick={onCancel}>Huỷ</button></div>
    </div>
  )
}

function NodePanel({ node, site, map, update, spots, reloadSpots, flash, onClose }) {
  const room = site.rooms.find((r) => r.node === node.id)
  const byId = Object.fromEntries(site.nodes.map((n) => [n.id, n]))
  const links = site.edges.filter((e) => e.a === node.id || e.b === node.id).map((e) => ({ e, other: byId[e.a === node.id ? e.b : e.a] }))
  const others = site.nodes.filter((n) => n.map !== node.map && ['entrance', 'junction', 'gate', 'landmark'].includes(n.type))
  const set = (k, v) => update((s) => { s.nodes.find((n) => n.id === node.id)[k] = v })
  const setRoom = (k, v) => update((s) => { s.rooms.find((r) => r.node === node.id)[k] = v })
  const c = spots.counts[node.id]
  const [upload, setUpload] = useState(null)
  const vidRef = useRef()
  const libRef = useRef()

  async function sendVideo(file) {
    if (!file) return
    flash(`Đã chọn video ${Math.round(file.size / 1e6)} MB, đang gửi lên…`)
    setUpload({ p: 0 })
    try {
      const r = await api.uploadVideo(node.id, file, (p) => setUpload({ p }),
        (stage) => setUpload({ p: 1, stage }))
      setUpload(null)
      flash(`Đã thêm ${r.frames} khung hình (xử lý ${Math.round(r.embedMs / 100) / 10}s)`)
      reloadSpots()
    } catch (e) { setUpload(null); flash(e.message) }
  }

  async function gpsHere() {
    try {
      flash('Đang đo GPS, giữ yên máy…')
      const g = await averageGps({ samples: 8 })
      update((s) => { const n = s.nodes.find((k) => k.id === node.id); n.lat = g.lat; n.lng = g.lng; n.acc = g.acc })
      flash(`Đã ghi GPS (±${Math.round(g.acc)} m) — nhớ bấm Lưu`)
    } catch (e) { flash(e.message) }
  }

  return (
    <div className="box">
      <div className="row between"><b>Điểm {node.id}</b><button className="link" onClick={onClose}>Đóng</button></div>
      <label>Tên hiển thị (dùng trong chỉ dẫn)<input value={node.label} onChange={(e) => set('label', e.target.value)} /></label>
      <label>Loại<select value={node.type} onChange={(e) => set('type', e.target.value)}>
        {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></label>
      <label className="check"><input type="checkbox" checked={!!node.verified} onChange={(e) => set('verified', e.target.checked)} /> Đã kiểm tại chỗ</label>

      <label className="check"><input type="checkbox" checked={!!room} onChange={(e) => update((s) => {
        if (e.target.checked) s.rooms.push({ id: node.id, code: '', name: node.label, node: node.id, aliases: [], verified: true })
        else s.rooms = s.rooms.filter((r) => r.node !== node.id)
      })} /> Là điểm đến (tìm kiếm được)</label>
      {room && (
        <div className="sub">
          <label>Số phòng<input value={room.code} placeholder="vd I109" onChange={(e) => setRoom('code', e.target.value)} /></label>
          <label>Tên điểm đến<input value={room.name} onChange={(e) => setRoom('name', e.target.value)} /></label>
          <label>Tên gọi khác (cách nhau dấu phẩy)<input value={(room.aliases || []).join(', ')} onChange={(e) => setRoom('aliases', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></label>
        </div>
      )}

      <h4>Đường nối ({links.length})</h4>
      <ul className="mini">
        {links.map(({ e, other }, i) => (
          <li key={i}>{e.kind === 'door' ? '🚪 ' : ''}{other?.label} <small>{other?.map !== node.map ? `(${other?.map})` : ''}</small>
            <button className="link" onClick={() => update((s) => { s.edges = s.edges.filter((x) => x !== s.edges.find((y) => y.a === e.a && y.b === e.b)) })}>✕</button></li>
        ))}
      </ul>
      {(node.type === 'entrance' || node.type === 'gate') && (
        <label>Nối cửa này với điểm ở bản đồ khác
          <select value="" onChange={(e) => e.target.value && update((s) => s.edges.push({ a: node.id, b: e.target.value, kind: 'door', verified: true }))}>
            <option value="">— chọn —</option>
            {others.map((n) => <option key={n.id} value={n.id}>[{n.map}] {n.label}</option>)}
          </select>
        </label>
      )}

      {map.kind === 'outdoor' && (
        <>
          <h4>Toạ độ GPS</h4>
          <p className="muted">{node.lat != null ? `${node.lat.toFixed(6)}, ${node.lng.toFixed(6)} (±${Math.round(node.acc || 0)} m)` : 'Chưa ghi — đang dùng vị trí suy ra từ neo bản đồ.'}</p>
          <div className="row"><button className="btn" onClick={gpsHere}>📍 Ghi GPS tại đây</button>
            {node.lat != null && <button className="btn" onClick={() => update((s) => { const n = s.nodes.find((k) => k.id === node.id); delete n.lat; delete n.lng; delete n.acc })}>Xoá GPS</button>}</div>
        </>
      )}

      <h4>Ảnh nhận diện</h4>
      <p className="muted">{c ? `${c.frames} khung từ ${c.videos} video, ${c.corrections} lần sửa` : 'Chưa có ảnh.'} Nên có ≥ 2 video quay ở thời điểm/hướng khác nhau.</p>
      <div className="thumbs">{(spots.thumbs[node.id] || []).map((t) => <img key={t} src={`/api/frames/${node.id}/${t}`} alt="" />)}</div>
      <p className="muted small">Đứng tại điểm này, quay chậm 10–15 giây, xoay một vòng nhìn dọc các hướng hành lang. Tránh quay mặt người.</p>
      {upload ? <p>Đang tải lên {Math.round(upload.p * 100)}%{upload.p >= 1 ? ({ embed: ' — đang tính vector (lần đầu nạp model ~2 phút)…', save: ' — đang lưu…' }[upload.stage] || ' — đang cắt khung…') : ''}</p> : (
        <div className="row wrap">
          <button className="btn primary" onClick={() => vidRef.current.click()}>🎥 Quay video tại điểm này</button>
          <button className="btn" onClick={() => libRef.current.click()}>📁 Chọn video có sẵn trong máy</button>
          {c && <button className="btn" onClick={async () => { if (confirm('Xoá toàn bộ ảnh của điểm này?')) { await api.clearSpot(node.id); reloadSpots() } }}>Xoá ảnh</button>}
        </div>
      )}
      <input ref={vidRef} type="file" accept="video/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; sendVideo(f) }} />
      <input ref={libRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; sendVideo(f) }} />
    </div>
  )
}

function MapPanel({ map, site, update, info, counts, onSelect, reload, flash, showTraces, setShowTraces, dirty }) {
  const imgRef = useRef()
  const impRef = useRef()
  const nodes = site.nodes.filter((n) => n.map === map.id)
  const coverage = [...nodes].sort((a, b) => (counts[a.id]?.frames || 0) - (counts[b.id]?.frames || 0))
  return (
    <div className="box">
      <b>{map.name}</b>
      <p className="muted">
        {info?.geo ? `Đã neo GPS (${map.anchors.length} neo) · ${info.metersPerPx} m/pixel${info.residualM != null ? ` · sai số neo ${info.residualM} m` : ''}`
          : `Chưa neo GPS (cần ≥ 2 neo). Khoảng cách đang tính theo tỉ lệ ước tính.`}
      </p>
      {!info?.geo && (
        <label>Tỉ lệ ước tính (mét / pixel)
          <input type="number" step="0.005" value={map.metersPerPx} onChange={(e) => update((s) => { s.maps.find((m) => m.id === map.id).metersPerPx = Number(e.target.value) })} />
        </label>
      )}
      <h4>Neo GPS ({map.anchors.length})</h4>
      <ul className="mini">
        {map.anchors.map((a, i) => (
          <li key={i}>({a.x}, {a.y}) → ±{Math.round(a.acc || 0)} m
            <button className="link" onClick={() => update((s) => s.maps.find((m) => m.id === map.id).anchors.splice(i, 1))}>✕</button></li>
        ))}
      </ul>
      <p className="muted small">Dùng công cụ “Neo GPS”: chạm vị trí trên sơ đồ rồi đứng đúng chỗ đó để đo. Neo ở 2–3 góc cách xa nhau.</p>

      <TraceRecorder onSaved={() => { reload(); flash('Đã lưu vết đi bộ') }} dirty={dirty} />
      <label className="check"><input type="checkbox" checked={showTraces} onChange={(e) => setShowTraces(e.target.checked)} /> Hiện vết đi bộ trên sơ đồ ({(site.traces || []).length})</label>

      <h4>Độ phủ ảnh nhận diện</h4>
      <ul className="mini">
        {coverage.map((n) => (
          <li key={n.id}><button className="link" onClick={() => onSelect(n.id)}>{n.label}</button> — {counts[n.id]?.frames || 0} khung</li>
        ))}
      </ul>

      <h4>Dữ liệu</h4>
      <div className="row wrap">
        <button className="btn" onClick={() => imgRef.current.click()}>Đổi ảnh sơ đồ</button>
        <a className="btn" href="/api/export" download>Xuất JSON</a>
        <button className="btn" onClick={() => impRef.current.click()}>Nhập JSON</button>
      </div>
      <input ref={imgRef} type="file" accept="image/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ''
        if (!f) return
        if (dirty && !confirm('Thay ảnh sẽ tải lại dữ liệu và bỏ thay đổi chưa lưu. Tiếp tục?')) return
        try { await api.uploadMapImage(map.id, f); await reload(); flash('Đã thay ảnh. Lưu ý: điểm cũ vẫn theo toạ độ ảnh cũ.') } catch (err) { flash(err.message) }
      }} />
      <input ref={impRef} type="file" accept="application/json" hidden onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ''
        if (!f || !confirm('Nhập file sẽ thay toàn bộ dữ liệu bản đồ hiện tại. Tiếp tục?')) return
        try { await api.importSite(f); await reload(); flash('Đã nhập dữ liệu') } catch (err) { flash(err.message) }
      }} />
    </div>
  )
}

function TraceRecorder({ onSaved, dirty }) {
  const [rec, setRec] = useState(false)
  const pts = useRef([])
  const [n, setN] = useState(0)
  const heading = useCompass(rec)
  const [steps, resetSteps] = useStepCounter(rec)
  const live = useRef({ heading: null, steps: 0 })
  live.current = { heading, steps }
  useEffect(() => {
    if (!rec) return
    const id = navigator.geolocation.watchPosition((p) => {
      pts.current.push({ t: p.timestamp, lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, steps: live.current.steps, heading: live.current.heading })
      setN(pts.current.length)
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0 })
    return () => navigator.geolocation.clearWatch(id)
  }, [rec])
  async function start() {
    await requestSensorPermission()
    pts.current = []
    setN(0)
    resetSteps()
    setRec(true)
  }
  async function stop() {
    setRec(false)
    if (pts.current.length < 2) return
    if (dirty && !confirm('Lưu vết sẽ tải lại dữ liệu và bỏ thay đổi bản đồ chưa lưu. Tiếp tục?')) return
    await api.addTrace({ created: new Date().toISOString(), points: pts.current, steps })
    onSaved()
  }
  return (
    <div>
      <h4>Ghi vết đi bộ</h4>
      {rec ? (
        <div className="row"><span>● Đang ghi: {n} điểm GPS, {steps} bước{heading != null ? `, hướng ${Math.round(heading)}°` : ''}</span><button className="btn" onClick={stop}>Dừng & lưu</button></div>
      ) : <button className="btn" onClick={start}>▶ Bắt đầu ghi vết</button>}
    </div>
  )
}
