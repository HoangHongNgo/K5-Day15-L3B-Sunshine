import { describe, expect, it, vi } from 'vitest'
import { dataUrlToBlob, savePhoto } from './photoSave'

const blob = new Blob(['x'], { type: 'image/jpeg' })

describe('dataUrlToBlob', () => {
  it('decodes synchronously so the share sheet still has the shutter tap', () => {
    const b = dataUrlToBlob('data:image/jpeg;base64,' + btoa('abc'))
    expect(b.type).toBe('image/jpeg')
    expect(b.size).toBe(3)
  })
})

describe('savePhoto', () => {
  it('opens the share sheet (iPhone: “Lưu hình ảnh” → Ảnh) when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn()
    const result = await savePhoto(blob, 'a.jpg', { canShare: () => true, share, download })
    expect(result).toBe('shared')
    expect(share.mock.calls[0][0].files[0].name).toBe('a.jpg')
    expect(download).not.toHaveBeenCalled()
  })

  it('treats closing the share sheet as a cancel, not an error', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'AbortError'))
    expect(await savePhoto(blob, 'a.jpg', { canShare: () => true, share, download: vi.fn() })).toBe('cancelled')
  })

  it('falls back to a file download when sharing files is unsupported', async () => {
    const download = vi.fn()
    expect(await savePhoto(blob, 'a.jpg', { canShare: () => false, share: vi.fn(), download })).toBe('downloaded')
    expect(download).toHaveBeenCalledWith(blob, 'a.jpg')
  })

  it('downloads when the share sheet fails for another reason', async () => {
    const download = vi.fn()
    const share = vi.fn().mockRejectedValue(new DOMException('x', 'NotAllowedError'))
    expect(await savePhoto(blob, 'a.jpg', { canShare: () => true, share, download })).toBe('downloaded')
  })
})
