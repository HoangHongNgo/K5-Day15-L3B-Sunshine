import { createServer as createHttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer as createViteServer } from 'vite'
import { describe, expect, it } from 'vitest'

describe('Vite dev proxy for VinUni Wayfinder backend', () => {
  it('forwards wayfinder and collector endpoints to FastAPI without shadowing /api/mascot/*', async () => {
    const received: Array<{ method: string; url: string }> = []
    const backend = createHttpServer((req, res) => {
      received.push({ method: req.method || 'GET', url: req.url || '/' })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, proxied: true, url: req.url }))
    })
    await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve))
    const backendPort = (backend.address() as AddressInfo).port
    const prevEnv = process.env.WAYFINDER_BACKEND
    process.env.WAYFINDER_BACKEND = `http://127.0.0.1:${backendPort}`

    const vite = await createViteServer({
      root: process.cwd(),
      configFile: `${process.cwd()}/vite.config.ts`,
      server: { host: '127.0.0.1', port: 0, strictPort: false },
      logLevel: 'silent',
    })
    await vite.listen()

    try {
      const address = vite.httpServer?.address() as AddressInfo
      const base = `http://127.0.0.1:${address.port}`

      for (const path of [
        '/api/health',
        '/api/destinations',
        '/api/spots/search?q=I109',
        '/api/route?to=i109&start=gate_main',
        '/api/site',
        '/api/export',
        '/maps/campus-osm.webp',
      ]) {
        const res = await fetch(`${base}${path}`)
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true, proxied: true, url: path })
      }

      const locateRes = await fetch(`${base}/api/locate`, { method: 'POST', body: new FormData() })
      expect(locateRes.status).toBe(200)
      expect(await locateRes.json()).toMatchObject({ proxied: true, url: '/api/locate' })

      const correctRes = await fetch(`${base}/api/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: 'p_1', trueSpot: 'n_1' }),
      })
      expect(correctRes.status).toBe(200)
      expect(await correctRes.json()).toMatchObject({ proxied: true, url: '/api/correct' })

      // Local Vite mascot middleware must NOT be shadowed by the wayfinder proxy.
      const mascotRes = await fetch(`${base}/api/mascot/status`)
      expect(mascotRes.status).toBe(200)
      const mascotBody = await mascotRes.json() as Record<string, unknown>
      expect(mascotBody).toHaveProperty('available')
      expect(mascotBody).not.toHaveProperty('proxied')
      expect(received.some(r => r.url.startsWith('/api/mascot'))).toBe(false)
    } finally {
      await vite.close()
      await new Promise<void>(resolve => backend.close(() => resolve()))
      if (prevEnv === undefined) delete process.env.WAYFINDER_BACKEND
      else process.env.WAYFINDER_BACKEND = prevEnv
    }
  })
})
