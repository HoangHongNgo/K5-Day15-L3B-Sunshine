import type { ScreenFoot } from './groundAnchor'
import type { GroundStatus } from './useGroundAnchor'

export type EncounterPhase = 'entry' | 'unlocked' | 'camera' | 'review' | 'sent'
export type CameraStatus = 'loading' | 'ready' | 'failed'
export type CameraPanel = 'none' | 'voice' | 'tools'

export type EncounterHint = {
  role: 'alert' | 'status'
  text: string
  action?: 'grant'
}

/** Tới nơi theo tuyến: mở camera check-in ngay (getUserMedia không cần chạm), mascot hiện liền. */
export function initialEncounterPhase({ arrived, demoNearby }: { arrived: boolean; demoNearby: boolean }): EncounterPhase {
  if (arrived) return 'camera'
  return demoNearby ? 'unlocked' : 'entry'
}

/** Vị trí đứng mặc định (góc dưới phải) để mascot hiện ngay, trước khi con quay dò được mặt sàn. */
export function initialFoot(selfie: boolean): ScreenFoot {
  return { x: 0.72, y: selfie ? 0.9 : 0.88, zoom: 1 }
}

export function isFootVisible(foot: ScreenFoot | null): foot is ScreenFoot {
  return foot !== null && foot.x >= -0.15 && foot.x <= 1.15 && foot.y >= 0 && foot.y <= 1.2
}

export function canCaptureEncounter(status: CameraStatus, placed: boolean): boolean {
  return status === 'ready' && placed
}

export function encounterCameraHint(input: {
  status: CameraStatus
  error: string
  selfie: boolean
  placed: boolean
  groundStatus: GroundStatus
  mascotName: string
}): EncounterHint | null {
  if (input.error) return { role: 'alert', text: input.error }
  if (input.status === 'loading') return { role: 'status', text: 'Đang mở camera…' }
  if (input.status !== 'ready') return null
  if (!input.selfie && input.groundStatus === 'needs-permission') {
    return {
      role: 'status',
      text: `Bật cảm biến để ${input.mascotName} đứng trên mặt sàn`,
      action: 'grant',
    }
  }
  if (!input.placed) {
    return {
      role: 'status',
      text: !input.selfie && input.groundStatus === 'searching'
        ? `Hướng camera xuống mặt sàn hoặc chạm vào khung hình để đặt ${input.mascotName}`
        : `Hãy chạm vào khung hình để đặt ${input.mascotName} trước khi chụp`,
    }
  }
  return null
}

export function toggleCameraPanel(current: CameraPanel, target: 'voice' | 'tools'): CameraPanel {
  return current === target ? 'none' : target
}
