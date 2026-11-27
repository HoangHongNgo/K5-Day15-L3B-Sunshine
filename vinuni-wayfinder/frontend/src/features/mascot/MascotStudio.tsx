import { useEffect, useId, useRef, useState } from 'react'
import { Check, LoaderCircle, RotateCcw, RotateCw, Sparkles, WandSparkles } from 'lucide-react'
import { Mascot } from './Mascot'
import { MascotPortrait } from './MascotPortrait'
import { useAuth } from '../events/AuthContext'
import { useEvents } from '../events/EventContext'
import { isCustomMascot, type MascotAsset } from '../events/events'
import { eventsApi } from '../events/eventsApi'

export function MascotPicker({ selected, onChange }: { selected: string; onChange: (id: string) => void }) {
  const { allMascots } = useEvents()
  return <div className="mascot-library" role="group" aria-label="Chọn mascot 3D cho sự kiện">
    {allMascots.filter(m => m.kind === 'tia' || m.kind === 'model3d').map(m =>
      <button type="button" key={m.id} aria-pressed={selected === m.id} className={`mascot-option ${selected === m.id ? 'selected' : ''}`} onClick={() => onChange(m.id)}>
        <Mascot asset={m} size={82} /><strong>{m.name}</strong><small>{m.kind === 'model3d' ? 'Do BTC tạo' : 'Có sẵn'}</small>
        {selected === m.id && <Check size={15} className="mascot-picked" aria-hidden="true" />}
      </button>)}
  </div>
}

export function MascotCreator({ club = '', onUse }: { club?: string; onUse: (id: string) => void }) {
  const { saveMascot } = useEvents()
  const { token } = useAuth()
  const id = useId()
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState<'generate' | 'save' | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState<MascotAsset | null>(null)
  const [angle, setAngle] = useState(0)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])

  async function generate() {
    if (busy) return
    if (!name.trim() || brief.trim().length < 15) {
      setError('Nhập tên và mô tả ít nhất 15 ký tự để tạo mascot.')
      return
    }
    setBusy('generate')
    setError('')
    const control = new AbortController()
    request.current = control
    try {
      const result = await eventsApi.generateMascot({ name: name.trim(), brief: brief.trim(), club }, token, control.signal)
      if (!isCustomMascot(result.mascot) || result.mascot.kind !== 'model3d') throw new Error('Mô hình nhận được không hợp lệ.')
      if (control.signal.aborted) return
      setPreview(result.mascot)
      setAngle(0)
      setSaved(false)
    } catch (e) {
      if (!control.signal.aborted) setError(e instanceof Error ? e.message : 'Chưa tạo được mascot 3D.')
    } finally {
      if (!control.signal.aborted) setBusy(null)
    }
  }

  async function usePreview() {
    if (!preview || saved || busy) return
    setBusy('save')
    setError('')
    try {
      let image: string | undefined
      try {
        const { mascotPortrait } = await import('./renderPortrait')
        image = mascotPortrait(preview)
      } catch { /* The geometry remains usable on another device with WebGL. */ }
      const issue = await saveMascot({ ...preview, image })
      if (issue) { setError(issue); return }
      setSaved(true)
      onUse(preview.id)
    } finally { setBusy(null) }
  }

  return <section className="mascot-creator" aria-label="Tạo mascot 3D">
    <div className="creator-title"><WandSparkles size={21} /><div><h3>Tạo mascot 3D cho CLB</h3><p>Mô tả hình dáng, màu sắc và phụ kiện của người bạn đồng hành.</p></div></div>
    <div className="studio-layout">
      <div className="creator-fields">
        <label htmlFor={`${id}-name`}>Tên mascot<input id={`${id}-name`} value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Ví dụ: Mầm" disabled={!!busy} /></label>
        <label htmlFor={`${id}-brief`}>Mô tả nhân vật<textarea id={`${id}-brief`} rows={4} maxLength={600} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Một chú robot tròn màu xanh lá, đội một chiếc lá nhỏ…" disabled={!!busy} /></label>
        <p className="api-note">{token ? 'Mỗi lần tạo sử dụng một lượt OpenAI API của máy chủ.' : 'Đăng nhập tài khoản BTC để tạo mascot.'}</p>
        <button type="button" className="button button-primary" onClick={() => void generate()} disabled={!!busy || !token} aria-busy={busy === 'generate'}>
          {busy === 'generate' ? <LoaderCircle size={18} className="recognition-spinner" /> : <Sparkles size={18} />}
          {busy === 'generate' ? 'Đang dựng mascot…' : preview ? 'Tạo phiên bản khác' : 'Tạo mascot 3D'}
        </button>
      </div>
      <div className="creator-preview" aria-live="polite">
        {preview ? <>
          <div role="img" aria-label={`Mô hình 3D ${preview.name}`} style={{ width: 180, height: 180 }}><MascotPortrait asset={preview} angle={angle} /></div>
          <strong>{preview.name}</strong>
          <div className="creator-modes" role="group" aria-label="Xoay mô hình">
            <button type="button" aria-label="Xoay trái" onClick={() => setAngle((angle + 7) % 8)}><RotateCcw size={16} /></button>
            <button type="button" aria-label="Xoay phải" onClick={() => setAngle((angle + 1) % 8)}><RotateCw size={16} /></button>
          </div>
          <button type="button" className="button button-quiet" onClick={() => void usePreview()} disabled={!!busy || saved}><Check size={18} />{saved ? 'Đã chọn mascot này' : busy === 'save' ? 'Đang lưu…' : 'Dùng mascot này'}</button>
        </> : <><div className="mascot-empty"><Sparkles size={36} /></div><strong>{busy ? 'Đang dựng mô hình' : 'Bản xem trước'}</strong><p>{busy ? 'Giữ trang mở để nhận kết quả.' : 'Tạo mascot để xem và xoay mô hình tại đây.'}</p></>}
      </div>
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>
}
