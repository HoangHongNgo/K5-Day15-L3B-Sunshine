import { resolve } from 'node:path'
import { loadEnv } from 'vite'

type ResolveOptions = {
  frontendRoot: string
  mode: string
  env?: Record<string, string | undefined>
}

/**
 * Đọc biến môi trường phía Node/Vite dev server từ file `.env` ở gốc repo
 * (2 cấp trên `vinuni-wayfinder/frontend/`), ưu tiên `process.env` > gốc repo > fallback `frontend/`.
 * Không bao giờ đưa biến này vào bundle trình duyệt.
 */
export function resolveServerEnv(key: string, { frontendRoot, mode, env = process.env }: ResolveOptions): string | undefined {
  const fromProcess = env[key]?.trim()
  if (fromProcess) return fromProcess

  const repoRoot = resolve(frontendRoot, '../..')
  const fromRepoRoot = loadEnv(mode, repoRoot, '')[key]?.trim()
  if (fromRepoRoot) return fromRepoRoot

  const fromFrontend = loadEnv(mode, frontendRoot, '')[key]?.trim()
  return fromFrontend || undefined
}
