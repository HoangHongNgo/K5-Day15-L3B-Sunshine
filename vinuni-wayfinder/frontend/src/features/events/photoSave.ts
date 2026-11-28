export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

type Deps = {
  canShare: (data: ShareData) => boolean
  share: (data: ShareData) => Promise<void>
  download: (blob: Blob, filename: string) => void
}

/** Giải mã data URL đồng bộ: giữ được "lần chạm" của nút chụp để Safari cho mở bảng chia sẻ. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',', 2)
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg'
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const browserDeps = (): Deps => ({
  canShare: data => typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare(data),
  share: data => navigator.share(data),
  download: downloadBlob,
})

/**
 * Web không được ghi thẳng vào thư viện Ảnh. Cách gần nhất: bảng chia sẻ của hệ điều hành
 * (iPhone: "Lưu hình ảnh" → Ảnh; Android: Ảnh/Lưu). Không chia sẻ được file thì tải về (Tải xuống).
 */
export async function savePhoto(blob: Blob, filename: string, deps: Deps = browserDeps()): Promise<SaveResult> {
  const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
  const data: ShareData = { files: [file] }
  if (deps.canShare(data)) {
    try {
      await deps.share(data)
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    }
  }
  deps.download(blob, filename)
  return 'downloaded'
}
