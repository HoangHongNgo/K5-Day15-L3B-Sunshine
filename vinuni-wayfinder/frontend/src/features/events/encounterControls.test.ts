import { describe, expect, it } from 'vitest'
import {
  canCaptureEncounter,
  encounterCameraHint,
  initialEncounterPhase,
  isFootVisible,
  toggleCameraPanel,
} from './encounterControls'

describe('initialEncounterPhase', () => {
  it('starts arrived events in unlocked phase so the greeting and CTA stay visible before opening check-in', () => {
    expect(initialEncounterPhase({ arrived: true, demoNearby: false })).toBe('unlocked')
    expect(initialEncounterPhase({ arrived: true, demoNearby: true })).toBe('unlocked')
  })

  it('starts demo nearby events in unlocked phase and normal events in entry phase', () => {
    expect(initialEncounterPhase({ arrived: false, demoNearby: true })).toBe('unlocked')
    expect(initialEncounterPhase({ arrived: false, demoNearby: false })).toBe('entry')
  })
})

describe('placement visibility and capture guard', () => {
  it('rejects null feet (behind camera) and feet outside the visible frame margins', () => {
    expect(isFootVisible(null)).toBe(false)
    expect(isFootVisible({ x: -0.2, y: 0.8, zoom: 1 })).toBe(false)
    expect(isFootVisible({ x: 1.2, y: 0.8, zoom: 1 })).toBe(false)
    expect(isFootVisible({ x: 0.5, y: -0.05, zoom: 1 })).toBe(false)
    expect(isFootVisible({ x: 0.5, y: 1.25, zoom: 1 })).toBe(false)
    expect(isFootVisible({ x: 0.72, y: 0.82, zoom: 1 })).toBe(true)
  })

  it('allows capture only when camera is ready and the mascot is currently placed on screen', () => {
    expect(canCaptureEncounter('loading', true)).toBe(false)
    expect(canCaptureEncounter('failed', true)).toBe(false)
    expect(canCaptureEncounter('ready', false)).toBe(false)
    expect(canCaptureEncounter('ready', true)).toBe(true)
  })
})

describe('encounterCameraHint', () => {
  it('prioritizes errors and loading states', () => {
    expect(encounterCameraHint({
      status: 'failed', error: 'Lỗi camera', selfie: false, placed: false, groundStatus: 'searching', mascotName: 'Tia',
    })).toEqual({ role: 'alert', text: 'Lỗi camera' })

    expect(encounterCameraHint({
      status: 'loading', error: '', selfie: false, placed: false, groundStatus: 'searching', mascotName: 'Tia',
    })).toEqual({ role: 'status', text: 'Đang mở camera…' })
  })

  it('shows an actionable Vietnamese placement hint while waiting for floor lock or after anchor leaves screen', () => {
    const searching = encounterCameraHint({
      status: 'ready', error: '', selfie: false, placed: false, groundStatus: 'searching', mascotName: 'Tia',
    })
    expect(searching?.role).toBe('status')
    expect(searching?.text).toContain('chạm vào khung hình')
    expect(searching?.text).toContain('Tia')

    const offscreen = encounterCameraHint({
      status: 'ready', error: '', selfie: false, placed: false, groundStatus: 'locked', mascotName: 'Tia',
    })
    expect(offscreen?.role).toBe('status')
    expect(offscreen?.text).toMatch(/chạm vào khung hình/i)

    expect(encounterCameraHint({
      status: 'ready', error: '', selfie: false, placed: true, groundStatus: 'locked', mascotName: 'Tia',
    })).toBeNull()
  })

  it('preserves the iOS sensor permission CTA when sensors need permission', () => {
    const grant = encounterCameraHint({
      status: 'ready', error: '', selfie: false, placed: true, groundStatus: 'needs-permission', mascotName: 'Tia',
    })
    expect(grant).toEqual({
      role: 'status',
      text: 'Bật cảm biến để Tia đứng trên mặt sàn',
      action: 'grant',
    })
  })
})

describe('toggleCameraPanel', () => {
  it('keeps voice and mascot tools directly reachable and mutually exclusive', () => {
    expect(toggleCameraPanel('none', 'voice')).toBe('voice')
    expect(toggleCameraPanel('voice', 'voice')).toBe('none')
    expect(toggleCameraPanel('voice', 'tools')).toBe('tools')
    expect(toggleCameraPanel('tools', 'voice')).toBe('voice')
    expect(toggleCameraPanel('tools', 'tools')).toBe('none')
  })
})
