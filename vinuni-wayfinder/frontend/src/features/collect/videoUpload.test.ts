import { describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './api.js'
import {
  DEFAULT_CHUNK_BYTES,
  MAX_VIDEO_BYTES,
  uploadVideoChunked,
} from './videoUpload'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeSyntheticFile(size: number, name = 'clip.mp4'): File {
  const bytes = new Uint8Array(size)
  for (let i = 0; i < size; i += 1) bytes[i] = (i * 31 + 7) & 0xff
  return new File([bytes], name, { type: 'video/mp4' })
}

describe('chunked spot video upload', () => {
  it('slices file with Blob.slice into <= 2 MiB sequential chunks, reports monotonic progress, and polls job', async () => {
    const fileSize = 5 * 1024 * 1024 + 321 // 3 chunks: 2 MiB, 2 MiB, 1 MiB + 321 B
    const file = makeSyntheticFile(fileSize, 'hallway.mp4')
    const expectedBytes = new Uint8Array(await file.arrayBuffer())
    const sliceSpy = vi.spyOn(file, 'slice')

    const requests: Array<{ url: string; method: string; contentType: string | null; byteLength: number }> = []
    const receivedChunks: Uint8Array[] = []
    let uploadIdSeen = ''

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const headers = new Headers(init?.headers)
      const contentType = headers.get('Content-Type')

      if (url.includes('/video/uploads/') && !url.includes('/chunks/')) {
        const body = JSON.parse(String(init?.body))
        uploadIdSeen = url.split('/video/uploads/')[1]
        requests.push({ url, method, contentType, byteLength: body.size })
        expect(body).toEqual({ size: fileSize, filename: 'hallway.mp4' })
        return jsonResponse({
          ok: true,
          uploadId: uploadIdSeen,
          chunkSize: DEFAULT_CHUNK_BYTES,
          parts: 3,
          received: 0,
          nextPart: 0,
        })
      }

      if (url.includes('/chunks/')) {
        const part = Number(url.split('/chunks/')[1])
        const blob = init?.body as Blob
        const bytes = new Uint8Array(await blob.arrayBuffer())
        expect(bytes.byteLength).toBeLessThanOrEqual(DEFAULT_CHUNK_BYTES)
        requests.push({ url, method, contentType, byteLength: bytes.byteLength })
        receivedChunks[part] = bytes
        const received = receivedChunks.reduce((sum, c) => sum + (c ? c.byteLength : 0), 0)
        if (part === 2) {
          return jsonResponse({ ok: true, job: 'job_abc', uploadId: uploadIdSeen, part, received, total: fileSize }, 202)
        }
        return jsonResponse({ ok: true, uploadId: uploadIdSeen, part, nextPart: part + 1, received, total: fileSize })
      }

      throw new Error(`Unexpected URL: ${url}`)
    })

    const progress: number[] = []
    const stages: string[] = []
    const pollMock = vi.fn(async (jobId: string, onStage?: (stage: string) => void) => {
      expect(jobId).toBe('job_abc')
      onStage?.('extract')
      onStage?.('embed')
      onStage?.('save')
      return { ok: true, frames: 24, embedMs: 1200 }
    })

    const result = await uploadVideoChunked('c_door', file, {
      onProgress: (p) => progress.push(p),
      onStage: (s) => stages.push(s),
      fetchImpl: fetchMock,
      pollJobImpl: pollMock,
      retryDelayMs: 0,
    })

    expect(result).toEqual({ ok: true, frames: 24, embedMs: 1200 })
    expect(sliceSpy).toHaveBeenCalledTimes(3)
    expect(uploadIdSeen).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

    // Exact request sequence: init + parts 0, 1, 2
    expect(requests.map((r) => r.method)).toEqual(['PUT', 'PUT', 'PUT', 'PUT'])
    expect(requests[0].url).toBe(`/api/spots/c_door/video/uploads/${uploadIdSeen}`)
    expect(requests[1]).toMatchObject({
      url: `/api/spots/c_door/video/uploads/${uploadIdSeen}/chunks/0`,
      contentType: 'application/octet-stream',
      byteLength: DEFAULT_CHUNK_BYTES,
    })
    expect(requests[2]).toMatchObject({
      url: `/api/spots/c_door/video/uploads/${uploadIdSeen}/chunks/1`,
      contentType: 'application/octet-stream',
      byteLength: DEFAULT_CHUNK_BYTES,
    })
    expect(requests[3]).toMatchObject({
      url: `/api/spots/c_door/video/uploads/${uploadIdSeen}/chunks/2`,
      contentType: 'application/octet-stream',
      byteLength: 1024 * 1024 + 321,
    })

    // Exact byte fidelity
    const joined = new Uint8Array(fileSize)
    joined.set(receivedChunks[0], 0)
    joined.set(receivedChunks[1], DEFAULT_CHUNK_BYTES)
    joined.set(receivedChunks[2], 2 * DEFAULT_CHUNK_BYTES)
    expect(Buffer.from(joined).equals(expectedBytes)).toBe(true)

    // Monotonic progress by accepted bytes
    expect(progress).toEqual([
      DEFAULT_CHUNK_BYTES / fileSize,
      (2 * DEFAULT_CHUNK_BYTES) / fileSize,
      1,
    ])
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1])
    }
    expect(stages).toEqual(['extract', 'embed', 'save'])
  })

  it('retries bounded transient gateway/network errors with short backoff and keeps progress monotonic', async () => {
    const fileSize = 2 * DEFAULT_CHUNK_BYTES + 100
    const file = makeSyntheticFile(fileSize)
    const calls: string[] = []
    const delays: number[] = []
    let initAttempts = 0
    let chunk1Attempts = 0
    let finalAttempts = 0

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      calls.push(url)

      if (!url.includes('/chunks/')) {
        initAttempts += 1
        if (initAttempts === 1) return new Response('Bad Gateway', { status: 502 })
        return jsonResponse({ ok: true, chunkSize: DEFAULT_CHUNK_BYTES, parts: 3, received: 0, nextPart: 0 })
      }

      const part = Number(url.split('/chunks/')[1])
      if (part === 0) {
        return jsonResponse({ ok: true, part: 0, nextPart: 1, received: DEFAULT_CHUNK_BYTES, total: fileSize })
      }
      if (part === 1) {
        chunk1Attempts += 1
        if (chunk1Attempts === 1) throw new TypeError('Failed to fetch')
        if (chunk1Attempts === 2) {
          // The backend accepted the part, but the connection dropped while reading its JSON.
          return new Response('{"received":', { status: 200 })
        }
        return jsonResponse({ ok: true, part: 1, nextPart: 2, received: 2 * DEFAULT_CHUNK_BYTES, total: fileSize })
      }
      finalAttempts += 1
      if (finalAttempts === 1) return new Response('Service Unavailable', { status: 503 })
      return jsonResponse({ ok: true, job: 'job_retry_ok', part: 2, received: fileSize, total: fileSize }, 202)
    })

    const progress: number[] = []
    const pollMock = vi.fn(async (jobId: string) => ({ ok: true, job: jobId, frames: 12, embedMs: 500 }))

    const result = await uploadVideoChunked('c_door', file, {
      onProgress: (p) => progress.push(p),
      fetchImpl: fetchMock,
      pollJobImpl: pollMock,
      retryDelayMs: 50,
      sleep: async (ms) => { delays.push(ms) },
    })

    expect(result).toEqual({ ok: true, job: 'job_retry_ok', frames: 12, embedMs: 500 })
    expect(initAttempts).toBe(2)
    expect(chunk1Attempts).toBe(3)
    expect(finalAttempts).toBe(2)
    expect(delays.length).toBe(4)
    expect(delays.every((d) => d > 0)).toBe(true)
    expect(progress).toEqual([
      DEFAULT_CHUNK_BYTES / fileSize,
      (2 * DEFAULT_CHUNK_BYTES) / fileSize,
      1,
    ])
  })

  it('stops after bounded retries on persistent 502 failures', async () => {
    const file = makeSyntheticFile(1024)
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('Bad Gateway', { status: 502 }))

    await expect(
      uploadVideoChunked('c_door', file, {
        fetchImpl: fetchMock,
        maxRetries: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toMatchObject({ status: 502 })

    // 1 initial attempt + 2 retries = 3 total attempts
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it.each([400, 404, 409, 413, 422, 500])('never retries permanent HTTP %i errors', async (status) => {
    const file = makeSyntheticFile(1024)
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (!url.includes('/chunks/')) {
        return jsonResponse({ ok: true, chunkSize: DEFAULT_CHUNK_BYTES, parts: 1, received: 0, nextPart: 0 })
      }
      return jsonResponse({ detail: { code: 'permanent_err', message: `Lỗi cố định ${status}` } }, status)
    })

    await expect(
      uploadVideoChunked('c_door', file, {
        fetchImpl: fetchMock,
        maxRetries: 3,
        retryDelayMs: 0,
      }),
    ).rejects.toMatchObject({ code: 'permanent_err', message: `Lỗi cố định ${status}`, status })

    // 1 init + 1 chunk attempt (zero retries)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects files over 200 MiB or empty before sending network requests', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const hugeFakeFile = {
      name: 'huge.mp4',
      size: MAX_VIDEO_BYTES + 1,
      slice: () => new Blob([]),
    } as unknown as File

    await expect(
      uploadVideoChunked('c_door', hugeFakeFile, { fetchImpl: fetchMock }),
    ).rejects.toMatchObject({ code: 'too_large', status: 413 })
    expect(fetchMock).not.toHaveBeenCalled()

    const emptyFile = new File([], 'empty.mp4', { type: 'video/mp4' })
    await expect(
      uploadVideoChunked('c_door', emptyFile, { fetchImpl: fetchMock }),
    ).rejects.toMatchObject({ code: 'invalid_size', status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('wires api.uploadVideo through chunked upload and pollJob with ApiError semantics', async () => {
    const file = makeSyntheticFile(512, 'small.mp4')
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/video/uploads/') && !url.includes('/chunks/')) {
        return jsonResponse({ ok: true, chunkSize: DEFAULT_CHUNK_BYTES, parts: 1, received: 0, nextPart: 0 })
      }
      if (url.includes('/chunks/0')) {
        return jsonResponse({ ok: true, job: 'job_via_api', part: 0, received: 512, total: 512 }, 202)
      }
      if (url === '/api/spots/jobs/job_via_api') {
        return jsonResponse({ status: 'done', stage: 'done', result: { ok: true, frames: 10, embedMs: 250 } })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const origFetch = globalThis.fetch
    vi.stubGlobal('fetch', fetchMock)
    try {
      const progress: number[] = []
      const res = await api.uploadVideo('c_door', file, (p: number) => progress.push(p))
      expect(res).toEqual({ ok: true, frames: 10, embedMs: 250 })
      expect(progress).toEqual([1])
    } finally {
      vi.stubGlobal('fetch', origFetch)
    }

    // Verify oversized error from api.uploadVideo is an ApiError instance
    const hugeFakeFile = { name: 'huge.mp4', size: MAX_VIDEO_BYTES + 1, slice: () => new Blob([]) }
    await expect(api.uploadVideo('c_door', hugeFakeFile)).rejects.toBeInstanceOf(ApiError)
  })
})
