import { readFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { describe, expect, it } from 'vitest'

describe('Vercel production proxy rewrites', () => {
  it('routes /api and /maps to the stable Tailscale Funnel backend without ephemeral trycloudflare URLs', () => {
    const vercelPath = fileURLToPath(new URL('../vercel.json', import.meta.url))
    const config = JSON.parse(readFileSync(vercelPath, 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>
    }
    const apiRewrite = config.rewrites.find(r => r.source === '/api/:path*')
    const mapsRewrite = config.rewrites.find(r => r.source === '/maps/:path*')

    expect(apiRewrite?.destination).toBe('https://minhphuong.tail65ddfe.ts.net/api/:path*')
    expect(mapsRewrite?.destination).toBe('https://minhphuong.tail65ddfe.ts.net/maps/:path*')
    expect(JSON.stringify(config)).not.toContain('trycloudflare.com')
  })
})

describe('Vite dev proxy for VinUni Wayfinder backend', () => {
  it('forwards wayfinder and collector endpoints to FastAPI without shadowing /api/mascot/*', async () => {
    const received: Array<{ method: string; url: string; contentType?: string; body: Buffer }> = []
    const backend = createHttpServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      req.on('end', () => {
        const body = Buffer.concat(chunks)
        received.push({
          method: req.method || 'GET',
          url: req.url || '/',
          contentType: req.headers['content-type'],
          body,
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, proxied: true, url: req.url, bytes: body.length }))
      })
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
        '/api/events',
        '/api/club-mascots/m1',
        '/api/auth/me',
        '/maps/campus-osm.webp',
      ]) {
        const res = await fetch(`${base}${path}`)
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true, proxied: true, url: path })
      }

      const locateRes = await fetch(`${base}/api/locate`, { method: 'POST', body: new FormData() })
      expect(locateRes.status).toBe(200)
      expect(await locateRes.json()).toMatchObject({ proxied: true, url: '/api/locate' })

      const voiceUrl = '/api/voice/directions?voice=1'
      const voiceRes = await fetch(`${base}${voiceUrl}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'Từ G101 đến G106?' }),
      })
      expect(voiceRes.status).toBe(200)
      expect(await voiceRes.json()).toMatchObject({ proxied: true, url: voiceUrl })

      const correctRes = await fetch(`${base}/api/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: 'p_1', trueSpot: 'n_1' }),
      })
      expect(correctRes.status).toBe(200)
      expect(await correctRes.json()).toMatchObject({ proxied: true, url: '/api/correct' })

      // Chunked video upload endpoints pass through the existing same-origin /api/spots proxy intact.
      const uploadInitUrl = '/api/spots/c_door/video/uploads/11111111-2222-4333-8444-555555555555'
      const initRes = await fetch(`${base}${uploadInitUrl}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: 256, filename: 'clip.mp4' }),
      })
      expect(initRes.status).toBe(200)
      expect(await initRes.json()).toMatchObject({ proxied: true, url: uploadInitUrl })

      const chunkPayload = new Uint8Array(256)
      for (let i = 0; i < chunkPayload.length; i += 1) chunkPayload[i] = i
      const chunkUrl = `${uploadInitUrl}/chunks/0`
      const chunkRes = await fetch(`${base}${chunkUrl}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunkPayload,
      })
      expect(chunkRes.status).toBe(200)
      expect(await chunkRes.json()).toMatchObject({ proxied: true, url: chunkUrl, bytes: 256 })
      const chunkReq = received.find((r) => r.url === chunkUrl)
      expect(chunkReq?.method).toBe('PUT')
      expect(chunkReq?.contentType).toBe('application/octet-stream')
      expect(chunkReq?.body.equals(Buffer.from(chunkPayload))).toBe(true)

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
