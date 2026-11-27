import { Camera, PanelsTopLeft } from 'lucide-react'

export type JourneyMode = 'camera' | 'card'

const preferenceKey = 'wayfinder.journey.mode'

export function preferredJourneyMode(): JourneyMode {
  try { return window.sessionStorage.getItem(preferenceKey) === 'card' ? 'card' : 'camera' }
  catch { return 'camera' }
}

export function rememberJourneyMode(mode: JourneyMode) {
  try { window.sessionStorage.setItem(preferenceKey, mode) } catch { /* The current route still carries the choice. */ }
}

export function JourneyModeButton({ current, onChange }: { current: JourneyMode; onChange: (mode: JourneyMode) => void }) {
  const toCamera = current === 'card'
  const Icon = toCamera ? Camera : PanelsTopLeft
  return <button type="button" className="journey-mode-button" onClick={() => onChange(toCamera ? 'camera' : 'card')}>
    <Icon size={18} aria-hidden="true" />{toCamera ? 'Camera' : 'Thẻ chỉ đường'}
  </button>
}
