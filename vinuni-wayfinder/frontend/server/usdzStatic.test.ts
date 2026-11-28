import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { usdzMiddleware } from './usdzStatic'

function fakeRes() {
  const headers: Record<string, string> = {}
  const chunks: Buffer[] = []
  return {
    headers, chunks, statusCode: 200,
    setHeader(k: string, v: string) { headers[k.toLowerCase()] = v },
    end(b?: Buffer) { if (b) chunks.push(b) },
  }
}

describe('usdzMiddleware', () => {
  const dir = mkdtempSync(join(tmpdir(), 'usdz-'))
  mkdirSync(join(dir, 'ar'))
  writeFileSync(join(dir, 'ar', 'tia3d.usdz'), Buffer.from('PK-usdz'))

  it('serves .usdz with the MIME type AR Quick Look requires', () => {
    const res = fakeRes(); const next = vi.fn()
    usdzMiddleware(dir)({ url: '/ar/tia3d.usdz?x=1', method: 'GET' } as never, res as never, next)
    expect(res.headers['content-type']).toBe('model/vnd.usdz+zip')
    expect(Buffer.concat(res.chunks).toString()).toBe('PK-usdz')
    expect(next).not.toHaveBeenCalled()
  })

  it('passes other requests and missing files through, and refuses path traversal', () => {
    for (const url of ['/index.html', '/ar/missing.usdz', '/ar/../../etc/passwd.usdz']) {
      const res = fakeRes(); const next = vi.fn()
      usdzMiddleware(dir)({ url, method: 'GET' } as never, res as never, next)
      expect(next).toHaveBeenCalled()
    }
  })
})
