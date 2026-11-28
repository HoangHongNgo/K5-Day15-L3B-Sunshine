// Lời gọi backend. Lỗi có dạng {detail: {code, message}} -> ném ApiError với message tiếng Việt.
import { uploadVideoChunked } from './videoUpload'

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function handle(res) {
  if (res.ok) return res.json()
  let body = null
  try { body = await res.json() } catch { /* không phải JSON */ }
  const d = body?.detail
  if (d && typeof d === 'object' && d.message) throw new ApiError(d.code, d.message, res.status)
  throw new ApiError('http_' + res.status, 'Máy chủ lỗi (' + res.status + '). Kiểm tra backend đang chạy.', res.status)
}

async function req(path, opts) {
  let res
  try {
    res = await fetch(path, opts)
  } catch {
    throw new ApiError('offline', 'Không kết nối được máy chủ. Điện thoại và laptop phải cùng Wi-Fi.', 0)
  }
  return handle(res)
}

// Backend xử lý video nền (cắt khung -> embed -> lưu); hỏi trạng thái đến khi xong.
// Mất mạng thoáng qua khi đang poll thì thử lại, tối đa ~10 phút.
export async function pollJob(job, onStage, { intervalMs = 1500, maxMs = 600000 } = {}) {
  const t0 = Date.now()
  let fails = 0
  while (Date.now() - t0 < maxMs) {
    await new Promise((r) => setTimeout(r, intervalMs))
    let j
    try {
      j = await req('/api/spots/jobs/' + job)
      fails = 0
    } catch (e) {
      if (e.status === 404 || ++fails > 5) throw e
      continue
    }
    if (j.status === 'done') return j.result
    if (j.status === 'error') throw new ApiError(j.code || 'processing_failed', j.message, 500)
    onStage?.(j.stage)
  }
  throw new ApiError('timeout', 'Xử lý video quá lâu. Kiểm tra cửa sổ backend.', 0)
}

export const api = {
  health: () => req('/api/health'),
  destinations: () => req('/api/destinations'),
  site: () => req('/api/site'),
  saveSite: (site) => req('/api/site', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(site) }),
  route: (params) => req('/api/route?' + new URLSearchParams(params)),
  spotSearch: (q) => req('/api/spots/search?' + new URLSearchParams({ q })),
  spots: () => req('/api/spots'),
  clearSpot: (id) => req('/api/spots/' + encodeURIComponent(id), { method: 'DELETE' }),
  locate(blob, previous) {
    const fd = new FormData()
    fd.append('image', blob, 'photo.jpg')
    if (previous) fd.append('previous', previous)
    return req('/api/locate', { method: 'POST', body: fd })
  },
  correct: (photoId, trueSpot) => req('/api/correct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId, trueSpot }) }),
  addTrace: (trace) => req('/api/traces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(trace) }),
  uploadMapImage(mapId, file) {
    const fd = new FormData()
    fd.append('image', file)
    return req('/api/maps/' + mapId + '/image', { method: 'POST', body: fd })
  },
  importSite(file) {
    const fd = new FormData()
    fd.append('file', file)
    return req('/api/import', { method: 'POST', body: fd })
  },
  uploadVideo(nodeId, file, onProgress, onStage) {
    return uploadVideoChunked(nodeId, file, {
      onProgress,
      onStage,
      pollJobImpl: pollJob,
      createError: (code, message, status) => new ApiError(code, message, status),
    })
  },
}
