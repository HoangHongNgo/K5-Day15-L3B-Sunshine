const shapes = ['ellipsoid', 'box', 'cone', 'cylinder', 'torus'] as const
const groups = ['body', 'leftArm', 'rightArm', 'mouth'] as const
type Vector = [number, number, number]
export type ModelPart = {
  shape: typeof shapes[number]
  group: typeof groups[number]
  color: string
  position: Vector
  size: Vector
  rotation: Vector
}
export type MascotRecipe = { version: 1; parts: ModelPart[] }

function vector(value: unknown, low: number, high: number) {
  return Array.isArray(value) && value.length === 3 && value.every(n => typeof n === 'number' && n >= low && n <= high)
}

export function isMascotRecipe(value: unknown): value is MascotRecipe {
  if (!value || typeof value !== 'object') return false
  const { version, parts } = value as MascotRecipe
  if (Object.keys(value).length !== 2 || version !== 1 || !Array.isArray(parts) || parts.length < 4 || parts.length > 48) return false
  const seen = new Set<ModelPart['group']>()
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Object.keys(part).length !== 6 || !groups.includes(part.group) || !shapes.includes(part.shape)) return false
    if (typeof part.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(part.color)) return false
    if (!vector(part.position, -5, 5) || !vector(part.size, .01, 5) || !vector(part.rotation, -360, 360)) return false
    seen.add(part.group)
  }
  return seen.size === groups.length
}
