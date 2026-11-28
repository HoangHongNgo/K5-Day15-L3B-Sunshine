export function requestSensorPermission(): Promise<boolean>
export function useGeolocation(enabled: boolean): { pos: { lat: number; lng: number; acc: number; t: number } | null; error: string | null }
export function useCompass(enabled: boolean): number | null
export function useStepCounter(enabled: boolean): [number, () => void]
export const STEP_LENGTH_M: number
export function averageGps(options?: { samples?: number; timeoutMs?: number; onProgress?: (n: number) => void }): Promise<unknown>
