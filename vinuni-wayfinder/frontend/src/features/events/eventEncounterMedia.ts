import { distanceM } from '../../shared/lib/geo.js'
import { isAnchor, type EventAnchor } from './events'

export const encounterRadius = 50
export const encounterAccuracy = 30

export function assessEncounterLocation(
  anchor: EventAnchor | null,
  fix: Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>,
): { status: 'missing' | 'uncertain' } | { status: 'near' | 'far'; meters: number } {
  if (!isAnchor(anchor)) return { status: 'missing' }
  if (!isAnchor({ lat: fix.latitude, lon: fix.longitude }) ||
    !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > encounterAccuracy) return { status: 'uncertain' }
  const distance = distanceM({ lat: anchor.lat, lng: anchor.lon }, { lat: fix.latitude, lng: fix.longitude })
  return { status: distance <= encounterRadius ? 'near' : 'far', meters: Math.round(distance) }
}

/** Match object-fit: cover in the camera preview. Mirror only the selfie video. */
export function captureEncounterPhoto(video: HTMLVideoElement, overlay: HTMLCanvasElement, selfie: boolean,
  output = document.createElement('canvas')) {
  const { videoWidth, videoHeight } = video
  if (!videoWidth || !videoHeight || !overlay.width || !overlay.height) throw new Error('Camera chưa có hình ảnh.')
  const scale = Math.min(1, 1200 / Math.max(overlay.width, overlay.height))
  output.width = Math.round(overlay.width * scale)
  output.height = Math.round(overlay.height * scale)
  const ctx = output.getContext('2d')
  if (!ctx) throw new Error('Trình duyệt chưa hỗ trợ chụp ảnh.')
  const { width, height } = output
  const ratio = Math.min(videoWidth / width, videoHeight / height)
  const cropWidth = width * ratio, cropHeight = height * ratio
  ctx.save()
  if (selfie) {
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, (videoWidth - cropWidth) / 2, (videoHeight - cropHeight) / 2,
    cropWidth, cropHeight, 0, 0, width, height)
  ctx.restore()
  ctx.drawImage(overlay, 0, 0, width, height)
  return output.toDataURL('image/jpeg', 0.80)
}

export async function submitEncounterPhoto(eventId: string, image: string, consent: boolean, send = fetch) {
  if (!consent) throw new Error('Cần xác nhận trước khi gửi ảnh cho CLB.')
  const response = await send(`/api/events/${encodeURIComponent(eventId)}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.status !== 'pending' || typeof result.id !== 'string') {
    throw new Error(typeof result?.detail === 'string' ? result.detail : 'Chưa nhận được xác nhận gửi ảnh từ máy chủ.')
  }
}
