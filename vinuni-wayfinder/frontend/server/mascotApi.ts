import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { chooseChromaKey, mascotCutout } from './mascotCutout'
import { resolveServerEnv } from './rootEnv'

// Development-only API: never included in the browser bundle or production
// deployment. Production requires authenticated club accounts and quotas first.
export function mascotApi(): Plugin {
  const token = randomUUID()
  let busy = false
  let attempts: number[] = []
  function respond(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(JSON.stringify(data))
  }
  async function body(req: IncomingMessage) {
    let result = ''
    for await (const chunk of req) { result += chunk; if (Buffer.byteLength(result) > 8192) throw new Error('body-too-large') }
    return JSON.parse(result)
  }
  return { name: 'local-mascot-api', apply: 'serve', configureServer(server) {
    // Load only in Node from repo root .env (fallback frontend/). Never added to Vite's client define.
    const apiKey = resolveServerEnv('OPENAI_API_KEY', { frontendRoot: server.config.root, mode: server.config.mode })
    server.middlewares.use(async (req, res, next) => {
      const path = req.url?.split('?')[0]
      if (path !== '/api/mascot/status' && path !== '/api/mascot/generate') return next()
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
      if (!loopback) return respond(res, 403, { error: 'Tạo ảnh AI hiện chỉ mở trên localhost của máy phát triển.' })
      const key = apiKey
      if (path === '/api/mascot/status' && req.method === 'GET') return respond(res, 200, { available: Boolean(key), token: key ? token : undefined })
      if (req.method !== 'POST') return respond(res, 405, { error: 'Phương thức không được hỗ trợ.' })
      let sameOrigin = false
      try { const origin = new URL(req.headers.origin ?? ''); sameOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) && origin.host === req.headers.host } catch { /* reject absent or malformed Origin */ }
      if (!sameOrigin || req.headers['x-mascot-token'] !== token) return respond(res, 403, { error: 'Phiên tạo ảnh đã thay đổi. Tải lại trang để tiếp tục.' })
      if (!key) return respond(res, 503, { error: 'Máy chủ chưa cấu hình OPENAI_API_KEY. Bạn vẫn có thể chọn mẫu hoặc tải ảnh lên.' })
      attempts = attempts.filter(t => Date.now() - t < 10 * 60_000)
      if (busy || attempts.length >= 3) return respond(res, 429, { error: busy ? 'Đang có một ảnh được tạo. Hãy đợi ảnh đó hoàn tất.' : 'Đã đạt 3 lượt trong 10 phút của bản thử. Hãy dùng mẫu đã tạo hoặc thử lại sau.' })
      let data: { name?: unknown; brief?: unknown; club?: unknown }
      try { data = await body(req) } catch { return respond(res, 400, { error: 'Nội dung gửi lên không hợp lệ.' }) }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return respond(res, 400, { error: 'Nội dung gửi lên không hợp lệ.' })
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 40 || typeof data.brief !== 'string' || data.brief.trim().length < 15 || data.brief.length > 600 || typeof data.club !== 'string' || data.club.length > 80) return respond(res, 400, { error: 'Nhập tên và mô tả mascot từ 15 đến 600 ký tự.' })
      busy = true; attempts.push(Date.now())
      try {
        // This account currently rejects gpt-image-2 background=transparent.
        // Generate once on a chroma key, then produce alpha locally, just as
        // with the existing Vini asset. No model downgrade or paid auto-retry.
        const chroma = chooseChromaKey(data.brief)
        const color = chroma === 'green' ? '#00FF00' : '#FF00FF'
        const prompt = `Create one original, friendly full-body mascot for a university club. Character name: ${data.name}. Club: ${data.club}. Creative brief: ${data.brief}. Premium soft 3D toy appearance rendered as a 2D cutout, approachable expression, readable silhouette on a small phone screen. Exactly one character centered, entire body and ears visible, 12% empty padding on every edge. The background is perfectly flat solid ${color}, a chroma key to remove later; no gradients, no floor, no background shadow, no scenery. Keep the key color off the character and avoid color spill from the backdrop. No lettering, no watermark, no layout panels. Use smooth rounded shapes with clean edges, not wispy fur. This is a character image, not a 3D mesh.`
        const response = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-image-2', prompt, n: 1, size: '1024x1024', quality: 'medium', background: 'opaque', output_format: 'png' }), signal: AbortSignal.timeout(120_000) })
        if (!response.ok) {
          const status = response.status
          const detail = await response.json().catch(() => ({})) as { error?: { code?: string; param?: string } }
          console.warn('Mascot provider rejected request', { status, code: detail.error?.code, param: detail.error?.param })
          return respond(res, status === 429 ? 429 : 502, { error: status === 429 ? 'API đang giới hạn lượt gọi hoặc tài khoản chưa đủ hạn mức. Hãy kiểm tra tài khoản rồi thử lại.' : status === 401 || status === 403 ? 'Key trên máy chủ chưa có quyền tạo ảnh. Bạn vẫn có thể dùng mẫu có sẵn.' : 'Dịch vụ tạo ảnh chưa hoàn tất yêu cầu. Bạn có thể thử lại; mỗi lần thử là một lượt API mới.' })
        }
        const result = await response.json() as { data?: { b64_json?: string }[]; usage?: unknown }
        const encoded = result.data?.[0]?.b64_json
        if (!encoded || encoded.length > 12_000_000 || !/^[A-Za-z0-9+/]+=*$/.test(encoded)) return respond(res, 502, { error: 'API chưa trả về ảnh hợp lệ. Hãy chọn mẫu hoặc thử lại.' })
        const cutout = await mascotCutout(Buffer.from(encoded, 'base64'), chroma)
        respond(res, 200, { image: `data:image/webp;base64,${cutout.toString('base64')}`, model: 'gpt-image-2', usage: result.usage ?? null })
      } catch { respond(res, 502, { error: 'Kết nối tạo ảnh bị ngắt hoặc quá thời gian chờ. Chưa tự gọi lại để tránh phát sinh thêm lượt API.' }) }
      finally { busy = false }
    })
  } }
}
