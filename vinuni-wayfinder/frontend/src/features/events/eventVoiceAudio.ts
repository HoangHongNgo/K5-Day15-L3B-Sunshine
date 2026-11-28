export const STT_SAMPLE_RATE = 16000
export const MAX_RECORDING_SECONDS = 30
export const MAX_RECORDING_MS = MAX_RECORDING_SECONDS * 1000
export const MAX_PCM_SAMPLES = STT_SAMPLE_RATE * MAX_RECORDING_SECONDS
export const MAX_QUESTION_CHARS = 500

type OfflineAudioWindow = Window & {
  MediaRecorder?: typeof MediaRecorder
  OfflineAudioContext?: typeof OfflineAudioContext
  webkitOfflineAudioContext?: typeof OfflineAudioContext
}

export type QuestionValidation =
  | { ok: true; text: string }
  | { ok: false; error: string }

export function validateQuestionText(value: string): QuestionValidation {
  const text = value.trim()
  if (!text) return { ok: false, error: 'Hãy nhập câu hỏi.' }
  if (Array.from(text).length > MAX_QUESTION_CHARS) {
    return { ok: false, error: `Hãy rút gọn câu hỏi còn tối đa ${MAX_QUESTION_CHARS} ký tự.` }
  }
  return { ok: true, text }
}

export function canRecordVoiceAudio(win?: Window): boolean {
  const target = (win ?? (typeof window === 'undefined' ? undefined : window)) as OfflineAudioWindow | undefined
  if (!target) return false
  const hasMic = typeof target.navigator?.mediaDevices?.getUserMedia === 'function'
  const hasRecorder = typeof target.MediaRecorder === 'function'
  const hasOfflineCtx =
    typeof target.OfflineAudioContext === 'function' || typeof target.webkitOfflineAudioContext === 'function'
  return hasMic && hasRecorder && hasOfflineCtx
}

export function mixDownToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0)
  const length = channels[0].length
  if (length === 0) return new Float32Array(0)
  const out = new Float32Array(length)
  if (channels.length === 1) {
    for (let i = 0; i < length; i++) {
      const sample = channels[0][i]
      out[i] = Number.isFinite(sample) ? sample : 0
    }
    return out
  }
  const count = channels.length
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (let c = 0; c < count; c++) {
      const sample = channels[c][i] ?? 0
      sum += Number.isFinite(sample) ? sample : 0
    }
    out[i] = sum / count
  }
  return out
}

export function encodeMonoPcm16Wav(samples: Float32Array, sampleRate = STT_SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const bounded = samples.length > MAX_PCM_SAMPLES ? samples.subarray(0, MAX_PCM_SAMPLES) : samples
  const dataBytes = bounded.length * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i)
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byteRate
  view.setUint16(32, 2, true) // blockAlign
  view.setUint16(34, 16, true) // bitsPerSample
  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let i = 0; i < bounded.length; i++) {
    const raw = bounded[i]
    const clamped = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0
    const pcm = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, pcm)), true)
  }
  return bytes
}

export async function decodeBlobToWav16k(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (!blob || blob.size === 0) {
    throw new Error('Đoạn ghi âm đang trống. Bạn hãy nói lại.')
  }
  const win = typeof window === 'undefined' ? undefined : (window as OfflineAudioWindow)
  const OfflineCtx = win?.OfflineAudioContext || win?.webkitOfflineAudioContext
  if (!OfflineCtx) {
    throw new Error('Trình duyệt không hỗ trợ xử lý âm thanh. Bạn có thể nhập câu hỏi.')
  }
  const arrayBuffer = await blob.arrayBuffer()
  const offline = new OfflineCtx(1, 1, STT_SAMPLE_RATE)
  let decoded: AudioBuffer
  try {
    decoded = await offline.decodeAudioData(arrayBuffer.slice(0))
  } catch {
    throw new Error('Không đọc được bản ghi âm trên thiết bị này. Bạn hãy thử lại hoặc nhập câu hỏi.')
  }
  if (decoded.length === 0 || decoded.numberOfChannels === 0) {
    throw new Error('Đoạn ghi âm đang trống. Bạn hãy nói lại.')
  }
  if (decoded.sampleRate !== STT_SAMPLE_RATE) {
    throw new Error('Trình duyệt chưa chuyển được âm thanh về chuẩn 16 kHz. Bạn có thể nhập câu hỏi.')
  }
  const channels: Float32Array[] = []
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    channels.push(decoded.getChannelData(c))
  }
  const mono = mixDownToMono(channels)
  if (mono.length === 0) {
    throw new Error('Đoạn ghi âm đang trống. Bạn hãy nói lại.')
  }
  return encodeMonoPcm16Wav(mono, STT_SAMPLE_RATE)
}

export type VoiceRecorderSession = {
  start(): Promise<boolean>
  finish(): Promise<Blob>
  cancel(): void
}

export type VoiceRecorderDeps = {
  getUserMedia: () => Promise<MediaStream>
  MediaRecorderCtor: typeof MediaRecorder
  maxDurationMs?: number
  onAutoStop: (blob: Blob) => void
  onError: (message: string) => void
}

function stopStreamTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach(track => {
    try { track.stop() } catch { /* ignore */ }
  })
}

export function createVoiceRecorderSession(deps: VoiceRecorderDeps): VoiceRecorderSession {
  const maxDurationMs = deps.maxDurationMs ?? MAX_RECORDING_MS
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false
  let finishing = false
  let resolveFinish: ((blob: Blob) => void) | null = null
  let rejectFinish: ((error: Error) => void) | null = null

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function releaseMedia() {
    clearTimer()
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.onerror = null
    }
    stopStreamTracks(stream)
    stream = null
    recorder = null
  }

  function buildBlob(mimeType: string): Blob {
    const type = mimeType || chunks[0]?.type || ''
    return new Blob(chunks, type ? { type } : undefined)
  }

  return {
    async start(): Promise<boolean> {
      const media = await deps.getUserMedia()
      if (cancelled) {
        stopStreamTracks(media)
        return false
      }
      stream = media
      chunks = []
      try {
        // Use browser default MediaRecorder container/codec (Chrome/Firefox/Safari compatible)
        const rec = new deps.MediaRecorderCtor(media)
        recorder = rec
        rec.ondataavailable = event => {
          if (event.data && event.data.size > 0) chunks.push(event.data)
        }
        rec.onerror = () => {
          if (cancelled) return
          const rejector = rejectFinish
          resolveFinish = null
          rejectFinish = null
          releaseMedia()
          const err = new Error('Ghi âm bị gián đoạn. Bạn hãy thử lại hoặc nhập câu hỏi.')
          if (rejector) rejector(err)
          else deps.onError(err.message)
        }
        rec.onstop = () => {
          const mime = rec.mimeType
          const resolver = resolveFinish
          const wasManualFinish = finishing
          resolveFinish = null
          rejectFinish = null
          releaseMedia()
          if (cancelled) return
          const blob = buildBlob(mime)
          if (wasManualFinish && resolver) {
            resolver(blob)
          } else {
            deps.onAutoStop(blob)
          }
        }
        rec.start()
        timer = setTimeout(() => {
          if (cancelled || finishing || !recorder || recorder.state === 'inactive') return
          try {
            recorder.stop()
          } catch {
            releaseMedia()
            deps.onError('Không dừng được ghi âm. Bạn hãy thử lại hoặc nhập câu hỏi.')
          }
        }, maxDurationMs)
        return true
      } catch {
        releaseMedia()
        throw new Error('Trình duyệt chưa khởi tạo được bộ ghi âm. Bạn có thể nhập câu hỏi.')
      }
    },

    finish(): Promise<Blob> {
      if (cancelled) return Promise.reject(new DOMException('Aborted', 'AbortError'))
      const activeRecorder = recorder
      if (!activeRecorder) {
        releaseMedia()
        return Promise.reject(new Error('Chưa có dữ liệu ghi âm.'))
      }
      finishing = true
      clearTimer()
      return new Promise<Blob>((resolve, reject) => {
        resolveFinish = resolve
        rejectFinish = reject
        if (activeRecorder.state !== 'inactive') {
          try {
            activeRecorder.stop()
          } catch {
            resolveFinish = null
            rejectFinish = null
            releaseMedia()
            reject(new Error('Không kết thúc được bản ghi âm. Bạn hãy thử lại.'))
          }
        }
      })
    },

    cancel() {
      if (cancelled) return
      cancelled = true
      clearTimer()
      const activeRecorder = recorder
      const rejector = rejectFinish
      resolveFinish = null
      rejectFinish = null
      if (activeRecorder) {
        activeRecorder.ondataavailable = null
        activeRecorder.onstop = null
        activeRecorder.onerror = null
        if (activeRecorder.state !== 'inactive') {
          try { activeRecorder.stop() } catch { /* ignore */ }
        }
      }
      stopStreamTracks(stream)
      stream = null
      recorder = null
      chunks = []
      if (rejector) rejector(new DOMException('Aborted', 'AbortError'))
    },
  }
}

type VoiceTarget = string | { destinationId?: string; photoId?: string }

function voiceUrl(target: VoiceTarget, action: 'ask' | 'transcribe') {
  if (typeof target === 'string') return `/api/events/${encodeURIComponent(target)}/${action}`
  return action === 'ask' ? '/api/voice/directions' : '/api/voice/transcribe'
}

export async function transcribeEventAudio(
  target: VoiceTarget,
  wav: Uint8Array<ArrayBuffer>,
  options: { signal?: AbortSignal; fetchFn?: typeof fetch } = {},
): Promise<string> {
  const fetchFn = options.fetchFn ?? fetch
  const response = await fetchFn(voiceUrl(target, 'transcribe'), {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'audio/wav' },
    body: wav,
    signal: options.signal,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || typeof body.transcript !== 'string' || !body.transcript.trim()) {
    throw new Error(
      typeof body.detail === 'string'
        ? body.detail
        : 'Chưa nhận diện được giọng nói. Bạn hãy thử lại hoặc nhập câu hỏi.',
    )
  }
  return body.transcript.trim()
}

type VoiceRoute = { startId: string; startLabel: string; destinationId: string }
export type VoiceAnswer = { answer: string; audioBase64?: string; route?: VoiceRoute }

export function voiceRouteHref(route: VoiceRoute) {
  const params = new URLSearchParams({ from: route.startId, fromLabel: route.startLabel, to: route.destinationId, mode: 'camera' })
  return `/hanh-trinh?${params}`
}

type AnswerAudio = Pick<HTMLAudioElement, 'onplaying' | 'onended' | 'onerror' | 'play' | 'pause'>

export function playAnswerAudio(
  audioBase64: string,
  createAudio: (src: string) => AnswerAudio,
  onSpeaking: (speaking: boolean) => void,
  onError: () => void,
) {
  const audio = createAudio(`data:audio/mpeg;base64,${audioBase64}`)
  let finished = false
  function stop() {
    if (finished) return
    finished = true
    audio.onplaying = audio.onended = audio.onerror = null
    audio.pause()
    onSpeaking(false)
  }
  function fail() {
    if (finished) return
    stop()
    onError()
  }
  audio.onplaying = () => onSpeaking(true)
  audio.onended = stop
  audio.onerror = fail
  void audio.play().catch(fail)
  return stop
}

export async function askEventQuestion(
  target: VoiceTarget,
  question: string,
  options: { signal?: AbortSignal; fetchFn?: typeof fetch; withAudio?: boolean } = {},
): Promise<VoiceAnswer> {
  const fetchFn = options.fetchFn ?? fetch
  const suffix = options.withAudio ? '?voice=1' : ''
  const response = await fetchFn(voiceUrl(target, 'ask') + suffix, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(typeof target === 'string' ? { question } : { question, ...target }),
    signal: options.signal,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || typeof body.answer !== 'string') {
    throw new Error(
      typeof body.detail === 'string'
        ? body.detail
        : 'Chưa lấy được câu trả lời. Bạn hãy thử lại.',
    )
  }
  const reply: VoiceAnswer = { answer: body.answer }
  if (typeof body.audioBase64 === 'string' && body.audioBase64) reply.audioBase64 = body.audioBase64
  const route = body.route
  if (typeof target !== 'string' && route && typeof route.startId === 'string' &&
    typeof route.startLabel === 'string' && typeof route.destinationId === 'string') {
    reply.route = { startId: route.startId, startLabel: route.startLabel, destinationId: route.destinationId }
  }
  return reply
}

export async function runVoiceQuestionTurn(
  target: VoiceTarget,
  wav: Uint8Array<ArrayBuffer>,
  options: {
    signal?: AbortSignal
    fetchFn?: typeof fetch
    withAudio?: boolean
    onTranscript?: (transcript: string) => void
  } = {},
): Promise<{ transcript: string } & VoiceAnswer> {
  const transcript = await transcribeEventAudio(target, wav, {
    signal: options.signal,
    fetchFn: options.fetchFn,
  })
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
  const checked = validateQuestionText(transcript)
  if (!checked.ok) {
    throw new Error(checked.error)
  }
  options.onTranscript?.(checked.text)
  const reply = await askEventQuestion(target, checked.text, options)
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
  return { transcript: checked.text, ...reply }
}
