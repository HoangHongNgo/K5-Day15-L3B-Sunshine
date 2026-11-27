import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { authHeaders } from './authApi'
import type { CampusEvent } from './events'

type Photo = { id: string; image: string }

export default function EventAlbum({ event }: { event: CampusEvent }) {
  const { account, token } = useAuth()
  const manage = Boolean(account && (account.id === event.ownerId || account.role === 'admin_truong'))
  const [photos, setPhotos] = useState<Photo[]>([])
  const [pending, setPending] = useState<Photo[]>([])
  const [refresh, reload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Đang tải album…')
  const url = '/api/events/' + encodeURIComponent(event.id) + '/photos'
  useEffect(() => {
    const ctrl = new AbortController()
    async function read(path: string, privateList = false): Promise<Photo[]> {
      const result = await fetch(path, { signal: ctrl.signal, cache: 'no-store', headers: privateList ? authHeaders(token) : {} })
      if (!result.ok) throw new Error('Chưa tải được album từ máy chủ.')
      const data = await result.json()
      if (!Array.isArray(data.photos)) throw new Error()
      return data.photos
    }
    setStatus('Đang tải album…')
    setPending([])
    Promise.all([read(url), manage ? read(url + '/pending', true) : Promise.resolve([])])
      .then(([approved, queue]) => {
        if (!ctrl.signal.aborted) { setPhotos(approved); setPending(queue); setStatus('') }
      }).catch(() => { if (!ctrl.signal.aborted) setStatus('Chưa tải được album từ máy chủ.') })
    return () => ctrl.abort()
  }, [url, manage, token, refresh])

  async function moderate(id: string, approve: boolean) {
    setBusy(true)
    try {
      const response = await fetch(url + '/' + encodeURIComponent(id) + (approve ? '/approve' : ''), {
        method: approve ? 'POST' : 'DELETE', headers: authHeaders(token),
      })
      if (!response.ok) throw new Error()
      reload(n => n + 1)
    } catch { setStatus('Chưa cập nhật được ảnh. Hãy thử lại.') }
    finally { setBusy(false) }
  }
  function card(photo: Photo, queued: boolean) {
    return <figure key={photo.id}>
      <img src={photo.image} alt="Ảnh người tham dự chụp cùng mascot" loading="lazy" />
      {manage && <figcaption>
        {queued && <button className="button button-primary" disabled={busy} onClick={() => void moderate(photo.id, true)}>Duyệt ảnh</button>}
        <button className="button button-quiet" disabled={busy} onClick={() => void moderate(photo.id, false)}>{queued ? 'Từ chối ảnh' : 'Gỡ ảnh'}</button>
      </figcaption>}
    </figure>
  }
  return <section className="event-album">
    <h2>Album sự kiện</h2>
    <p role="status">{status || (!photos.length ? 'Chưa có ảnh được duyệt.' : '')}</p>
    <button className="button button-quiet" disabled={busy || status === 'Đang tải album…'} onClick={() => reload(n => n + 1)}>Tải lại album</button>
    <div className="event-album-grid">{photos.map(photo => card(photo,false))}</div>
    {manage && pending.length > 0 && <><h3>Ảnh chờ duyệt ({pending.length})</h3><div className="event-album-grid">{pending.map(photo => card(photo,true))}</div></>}
  </section>
}
