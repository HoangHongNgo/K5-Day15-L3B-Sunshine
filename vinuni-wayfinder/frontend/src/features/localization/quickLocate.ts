import type { BackendLocateResponse } from '../wayfinder/wayfinderApi'

export type LocateNext =
  | { kind: 'go'; spot: string; label: string }
  | { kind: 'pick' }
  | { kind: 'again'; previous: string }

/** Một lần chụp: chắc chắn → đi luôn; chưa chắc → top 3; lần đầu yếu → xin 1 ảnh góc khác (không bao giờ ảnh thứ 3). */
export function afterLocate(res: BackendLocateResponse): LocateNext {
  if (res.tier === 'auto') return { kind: 'go', spot: res.spot, label: res.label }
  if (res.tier === 'second' && !res.combined) return { kind: 'again', previous: res.photoId }
  return { kind: 'pick' }
}

/** Đã biết điểm đến thì vào thẳng hành trình; `tuAnh=1` để màn hành trình hiện "Không phải ở đây?". */
export function startUrl(spot: string, label: string, to: string, mode: string) {
  const q = new URLSearchParams({ from: spot, fromLabel: label })
  if (!to) return `/di-den?${q}`
  q.set('to', to)
  q.set('mode', mode)
  q.set('tuAnh', '1')
  return `/hanh-trinh?${q}`
}
