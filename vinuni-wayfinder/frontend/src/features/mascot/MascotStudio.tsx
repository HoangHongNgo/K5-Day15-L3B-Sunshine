import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { ImagePlus, LoaderCircle, Sparkles, Upload, Check, WandSparkles } from 'lucide-react'
import { Mascot } from './Mascot'
import { useEvents } from '../events/EventContext'
import type { MascotAsset } from '../events/events'

async function optimizeImage(source: Blob | string): Promise<string> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (image.naturalWidth < 64 || image.naturalHeight < 64 || image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error('Chọn ảnh có mỗi chiều từ 64 đến 4096 pixel.')
    const canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 512
    const ratio = Math.min(472 / image.naturalWidth, 472 / image.naturalHeight)
    const width = image.naturalWidth * ratio, height = image.naturalHeight * ratio
    canvas.getContext('2d')!.drawImage(image, (512 - width) / 2, (512 - height) / 2, width, height)
    const result = canvas.toDataURL('image/webp', .9)
    if (result.length > 800_000) throw new Error('Ảnh vẫn quá lớn sau khi tối ưu. Hãy chọn ảnh đơn giản hơn.')
    return result
  } finally { if (typeof source !== 'string') URL.revokeObjectURL(url) }
}

export function MascotPicker({ selected, onChange }: { selected: string; onChange: (id: string) => void }) {
  const { allMascots } = useEvents()
  return <div className="mascot-library" role="group" aria-label="Chọn mascot cho sự kiện">
    {allMascots.map(m => <button type="button" key={m.id} aria-pressed={selected === m.id} className={`mascot-option ${selected === m.id ? 'selected' : ''}`} onClick={() => onChange(m.id)}>
      <Mascot asset={m} size={82} mood="wave" /><strong>{m.name}</strong><small>{m.kind === 'image' ? 'Của bạn' : m.id === 'vini' ? 'Mặc định' : 'Có sẵn'}</small>{selected === m.id && <Check size={15} className="mascot-picked" aria-hidden="true" />}
    </button>)}
  </div>
}

export function MascotCreator({ club = '', onUse }: { club?: string; onUse: (id: string) => void }) {
  const { saveMascot } = useEvents()
  const id = useId()
  const [mode, setMode] = useState<'ai' | 'upload'>('ai')
  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [preview, setPreview] = useState<MascotAsset | null>(null)
  const [api, setApi] = useState<{ available: boolean; token?: string } | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    const control = new AbortController()
    fetch('/api/mascot/status', { signal: control.signal, cache: 'no-store' }).then(async r => r.ok ? r.json() : { available: false }).then(setApi).catch(() => { if (!control.signal.aborted) setApi({ available: false }) })
    return () => { control.abort(); request.current?.abort() }
  }, [])
  async function generate() {
    if (busy) return
    if (!name.trim() || brief.trim().length < 15) { setError('Nhập tên và mô tả ít nhất 15 ký tự để tạo mascot.'); return }
    setBusy(true); setError(''); setSaved(false)
    const control = new AbortController(); request.current = control
    try {
      const response = await fetch('/api/mascot/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mascot-Token': api?.token ?? '' }, body: JSON.stringify({ name: name.trim(), club, brief: brief.trim() }), signal: control.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Chưa tạo được ảnh. Hãy thử lại sau.')
      const image = await optimizeImage(data.image)
      if (!control.signal.aborted) setPreview({ id: crypto.randomUUID(), name: name.trim(), kind: 'image', image, brief: brief.trim() })
    } catch (e) { if (!control.signal.aborted) setError(e instanceof Error ? e.message : 'Chưa kết nối được dịch vụ tạo ảnh.') }
    finally { if (!control.signal.aborted) setBusy(false) }
  }
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type) || file.size > 3 * 1024 * 1024) { setError('Chọn ảnh PNG, WebP hoặc JPG dưới 3 MB.'); return }
    setError(''); setSaved(false); setBusy(true)
    try { setPreview({ id: crypto.randomUUID(), name: name.trim() || 'Bạn đồng hành', kind: 'image', image: await optimizeImage(file) }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Không đọc được ảnh này.') }
    finally { setBusy(false) }
  }
  function useImage() {
    if (!preview) return
    const mascot = { ...preview, name: name.trim() || preview.name }
    const issue = saveMascot(mascot)
    if (issue) { setError(issue); return }
    setSaved(true); onUse(mascot.id)
  }
  return <section className="mascot-creator" aria-label="Tạo mascot riêng">
    <div className="creator-title"><WandSparkles size={21} /><div><h3>Một người bạn của riêng CLB</h3><p>Mô tả ý tưởng hoặc dùng hình bạn đã có.</p></div></div>
    <div className="creator-modes" role="group" aria-label="Cách tạo mascot"><button type="button" disabled={busy} aria-pressed={mode === 'ai'} onClick={() => setMode('ai')}><Sparkles size={16} />Tạo bằng AI</button><button type="button" disabled={busy} aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}><Upload size={16} />Tải ảnh lên</button></div>
    <div className="studio-layout"><div className="creator-fields">
      <label htmlFor={`${id}-name`}>Tên mascot<input id={`${id}-name`} value={name} onChange={e => { setName(e.target.value); setSaved(false) }} maxLength={40} placeholder="Ví dụ: Momo" disabled={busy} /></label>
      {mode === 'ai' ? <><label htmlFor={`${id}-brief`}>Bạn muốn người bạn này trông thế nào?<textarea id={`${id}-brief`} rows={4} maxLength={600} value={brief} onChange={e => setBrief(e.target.value)} placeholder="Một chú chim cánh cụt đeo tai nghe, áo đỏ và xanh navy, thân thiện, dành cho CLB âm nhạc…" disabled={busy} /></label><p className="field-hint">Ảnh 2D phong cách 3D. Nhân vật sẽ chuyển động nhẹ trong app.</p>
        {api?.available ? <p className="api-note">Dùng OpenAI API đã cấu hình trên máy chủ. Mỗi lần bấm tạo là một lượt API có tính phí.</p> : <p className="api-note">{api === null ? 'Đang kiểm tra dịch vụ tạo ảnh…' : 'Tạo AI mở trên localhost khi máy chủ có key. Bạn vẫn có thể tải ảnh hoặc chọn mẫu có sẵn.'}</p>}
        <button type="button" className="button button-primary" onClick={() => void generate()} disabled={busy || !api?.available} aria-busy={busy}>{busy ? <LoaderCircle size={18} className="recognition-spinner" /> : <Sparkles size={18} />}{busy ? 'Đang tạo nhân vật…' : preview ? 'Tạo một phiên bản khác' : 'Tạo mascot'}</button>
      </> : <label className="mascot-upload"><ImagePlus size={30} /><strong>Chọn hình mascot</strong><span>PNG nền trong suốt, WebP hoặc JPG. Tối đa 3 MB.</span><input type="file" accept="image/png,image/webp,image/jpeg" aria-label="Tải ảnh mascot" onChange={e => void upload(e)} disabled={busy} /></label>}
    </div><div className="creator-preview" aria-live="polite">{preview ? <><Mascot asset={preview} size={180} mood="wave" /><strong>{name.trim() || preview.name}</strong><p>{saved ? 'Đã lưu vào thư viện và chọn cho bạn.' : 'Xem thử trước khi chọn.'}</p><button type="button" className="button button-quiet" onClick={useImage} disabled={busy || saved}><Check size={18} />{saved ? 'Đã chọn mascot này' : 'Dùng mascot này'}</button></> : <><div className="mascot-empty"><Sparkles size={36} /></div><strong>{busy ? 'Người bạn mới đang thành hình' : 'Chờ gặp người bạn mới'}</strong><p>{busy ? 'Giữ trang mở để nhận kết quả.' : 'Ảnh tạo xong sẽ xuất hiện ở đây.'}</p></>}</div></div>
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>
}
