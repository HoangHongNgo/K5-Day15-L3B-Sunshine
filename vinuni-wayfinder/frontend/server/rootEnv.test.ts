import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveServerEnv } from './rootEnv'

describe('Unified root .env loader for frontend Vite server', () => {
  it('reads variables from repo root .env, letting process.env override and preferring root over legacy frontend .env', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'vinuni-root-env-'))
    const frontendRoot = join(repoRoot, 'vinuni-wayfinder', 'frontend')
    mkdirSync(frontendRoot, { recursive: true })

    try {
      writeFileSync(
        join(repoRoot, '.env'),
        'OPENAI_API_KEY=sk-from-root\nWAYFINDER_BACKEND=http://127.0.0.1:9001\n',
        'utf-8',
      )
      writeFileSync(
        join(frontendRoot, '.env'),
        'OPENAI_API_KEY=sk-from-legacy-frontend\nLEGACY_VAR=yes\n',
        'utf-8',
      )

      expect(resolveServerEnv('OPENAI_API_KEY', { frontendRoot, mode: 'development', env: {} }))
        .toBe('sk-from-root')
      expect(resolveServerEnv('WAYFINDER_BACKEND', { frontendRoot, mode: 'development', env: {} }))
        .toBe('http://127.0.0.1:9001')
      expect(resolveServerEnv('LEGACY_VAR', { frontendRoot, mode: 'development', env: {} }))
        .toBe('yes')
      expect(resolveServerEnv('OPENAI_API_KEY', {
        frontendRoot,
        mode: 'development',
        env: { OPENAI_API_KEY: 'sk-from-process' },
      })).toBe('sk-from-process')
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})
