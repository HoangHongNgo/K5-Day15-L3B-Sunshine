export const MAX_VIDEO_BYTES = 200 * 1024 * 1024
export const DEFAULT_CHUNK_BYTES = 2 * 1024 * 1024

const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504])
const DEFAULT_MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 400

export type UploadErrorFactory = (code: string, message: string, status: number) => Error

export interface UploadVideoOptions {
  onProgress?: (fraction: number) => void
  onStage?: (stage: string) => void
  fetchImpl?: typeof fetch
  pollJobImpl?: (jobId: string, onStage?: (stage: string) => void) => Promise<unknown>
  createUploadId?: () => string
  createError?: UploadErrorFactory
  sleep?: (ms: number) => Promise<void>
  maxRetries?: number
  retryDelayMs?: number
}

interface UploadInitAck {
  ok: boolean
  uploadId?: string
  chunkSize?: number
  parts?: number
  received?: number
  nextPart?: number
  job?: string
}

interface ChunkAck {
  ok: boolean
  job?: string
  part?: number
  nextPart?: number
  received?: number
  total?: number
}

function defaultCreateError(code: string, message: string, status: number): Error {
  const err = new Error(message) as Error & { code: string; status: number }
  err.code = code
  err.status = status
  return err
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function generateUploadId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function toResponseError(res: Response, createError: UploadErrorFactory): Promise<Error> {
  let body: { detail?: { code?: string; message?: string } } | null = null
  try {
    body = (await res.json()) as { detail?: { code?: string; message?: string } }
  } catch {
    /* non-JSON gateway response */
  }
  const detail = body?.detail
  if (detail && typeof detail === 'object' && detail.message) {
    return createError(detail.code || `http_${res.status}`, detail.message, res.status)
  }
  return createError(`http_${res.status}`, `Lỗi tải video (${res.status})`, res.status)
}

async function sendWithRetry<T>(
  send: () => Promise<Response>,
  {
    maxRetries,
    retryDelayMs,
    sleep,
    createError,
  }: {
    maxRetries: number
    retryDelayMs: number
    sleep: (ms: number) => Promise<void>
    createError: UploadErrorFactory
  },
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let res: Response | undefined
    try {
      res = await send()
      if (res.ok) return (await res.json()) as T
    } catch {
      // A connection can drop after the server accepts a part but before JSON arrives.
    }

    if (res && !res.ok && (!TRANSIENT_GATEWAY_STATUSES.has(res.status) || attempt === maxRetries)) {
      throw await toResponseError(res, createError)
    }
    if (attempt === maxRetries) {
      throw createError('offline', 'Mất kết nối khi tải video', 0)
    }
    res?.body?.cancel().catch(() => {})
    await sleep(retryDelayMs * (attempt + 1))
  }

  throw createError('offline', 'Mất kết nối khi tải video', 0)
}

export async function uploadVideoChunked(
  nodeId: string,
  file: Pick<File, 'size' | 'slice'> & { name?: string },
  opts: UploadVideoOptions = {},
): Promise<unknown> {
  const createError = opts.createError || defaultCreateError
  if (!file || typeof file.size !== 'number' || file.size <= 0) {
    throw createError('invalid_size', 'Video rỗng hoặc không hợp lệ', 400)
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw createError('too_large', 'Video quá lớn (tối đa 200 MiB)', 413)
  }

  const fetchImpl = opts.fetchImpl || globalThis.fetch
  const sleep = opts.sleep || defaultSleep
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const uploadId = (opts.createUploadId || generateUploadId)()
  const basePath = `/api/spots/${encodeURIComponent(nodeId)}/video/uploads/${encodeURIComponent(uploadId)}`
  const retryOpts = { maxRetries, retryDelayMs, sleep, createError }

  const initAck = await sendWithRetry<UploadInitAck>(
    () =>
      fetchImpl(basePath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: file.size, filename: file.name || 'video.mp4' }),
      }),
    retryOpts,
  )

  if (initAck.job) {
    opts.onProgress?.(1)
    return opts.pollJobImpl ? opts.pollJobImpl(initAck.job, opts.onStage) : initAck
  }

  const chunkSize = initAck.chunkSize
  if (!chunkSize || !Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > DEFAULT_CHUNK_BYTES) {
    throw createError('invalid_upload_response', 'Máy chủ trả kích thước phần tải lên không hợp lệ', 502)
  }
  const totalParts = Math.ceil(file.size / chunkSize)

  let acceptedBytes = 0
  let finalAck: ChunkAck | null = null

  for (let part = 0; part < totalParts; part += 1) {
    const start = part * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const slice = file.slice(start, end)

    const ack = await sendWithRetry<ChunkAck>(
      () =>
        fetchImpl(`${basePath}/chunks/${part}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: slice,
        }),
      retryOpts,
    )

    const reported = typeof ack.received === 'number' ? ack.received : end
    acceptedBytes = Math.max(acceptedBytes, Math.min(file.size, reported))
    opts.onProgress?.(acceptedBytes / file.size)

    if (part === totalParts - 1) {
      finalAck = ack
    }
  }

  if (finalAck?.job) {
    return opts.pollJobImpl ? opts.pollJobImpl(finalAck.job, opts.onStage) : finalAck
  }
  throw createError('missing_video_job', 'Máy chủ chưa xác nhận đã nhận đủ video', 502)
}
