import type { BackendLocateResponse } from '../wayfinder/wayfinderApi'

export function matchesIndoorVenue(room: string, result: Pick<BackendLocateResponse, 'tier' | 'roomIds'>) {
  return result.tier === 'auto' && Array.isArray(result.roomIds) && result.roomIds.includes(room)
}
