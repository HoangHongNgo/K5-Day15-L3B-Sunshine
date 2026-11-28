import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/** AR Quick Look (iPhone) chỉ vào được tab AR khi .usdz có đúng MIME; Vite mặc định trả Content-Type rỗng. */
export function usdzMiddleware(root: string) {
  const base = resolve(root)
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0])
    if (!path.endsWith('.usdz') || (req.method !== 'GET' && req.method !== 'HEAD')) return next()
    const file = resolve(base, '.' + path)
    if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) return next()
    res.setHeader('Content-Type', 'model/vnd.usdz+zip')
    res.setHeader('Cache-Control', 'no-cache')
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file))
  }
}

export function usdzStatic(): Plugin {
  return {
    name: 'usdz-static',
    configureServer(server) { server.middlewares.use(usdzMiddleware(server.config.publicDir)) },
    configurePreviewServer(server) { server.middlewares.use(usdzMiddleware(server.config.build.outDir)) },
  }
}
