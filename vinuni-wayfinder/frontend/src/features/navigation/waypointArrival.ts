import { distanceM } from '../../shared/lib/geo.js'
import { wayfinderApi, type BackendStep, type BackendLocateResponse } from '../wayfinder/wayfinderApi'

export function hasOutdoorTarget(step: BackendStep) {
  const { lat, lng } = step.target
  return step.mapKind === 'outdoor' && lat != null && Math.abs(lat) <= 90 && lng != null && Math.abs(lng) <= 180 && step.meters > 0
}

/** Ngưỡng tự chuyển chặng bằng GPS — heuristic (tự ước tính), chưa đo trên campus. */
export const GPS_MAX_ACCURACY_M = 30
export const GPS_MIN_STEP_M = 12
const GPS_MIN_RADIUS_M = 10
const GPS_MAX_RADIUS_M = 20

type Coords = Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'accuracy'>
export type GpsArrival = { distance: number | null; match: boolean; weak: boolean }

/** Bán kính "đã tới" theo sai số GPS (10–20 m), không quá nửa chặng để không tới ngay vạch xuất phát. */
export function gpsArrivalRadius(accuracy: number, stepMeters: number) {
  return Math.min(Math.max(accuracy, GPS_MIN_RADIUS_M), GPS_MAX_RADIUS_M, stepMeters / 2)
}

export function gpsArrival(step: BackendStep, coords: Coords): GpsArrival {
  if (!hasOutdoorTarget(step) || !Number.isFinite(coords.accuracy) || coords.accuracy < 0 ||
    Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) return { distance: null, match: false, weak: false }
  const distance = distanceM({ lat: coords.latitude, lng: coords.longitude }, { lat: step.target.lat!, lng: step.target.lng! })
  const weak = coords.accuracy > GPS_MAX_ACCURACY_M
  const match = !weak && step.meters >= GPS_MIN_STEP_M && distance <= gpsArrivalRadius(coords.accuracy, step.meters)
  return { distance, match, weak }
}

export function gpsMatchesWaypoint(step: BackendStep, coords: Coords) {
  return gpsArrival(step, coords).match
}

export function photoMatchesWaypoint(node: string, finalNode: string | undefined, result: Pick<BackendLocateResponse, 'tier' | 'spot'>) {
  return !!result.spot && result.tier === 'auto' && (result.spot === node || result.spot === finalNode)
}

export async function locateVideoFrame(video: HTMLVideoElement, signal: AbortSignal) {
  if (!video.videoWidth || !video.videoHeight) throw new Error('Camera chưa có hình.')
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight))
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Camera chưa có hình.')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const photo = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!photo || signal.aborted) throw new Error('Dừng nhận diện.')
  return wayfinderApi.locate(photo, undefined, signal)
}
