import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EventVoice, * as eventVoiceModule from './EventVoice'
import * as audioModule from './eventVoiceAudio'
import {
  MAX_RECORDING_MS,
  MAX_RECORDING_SECONDS,
  STT_SAMPLE_RATE,
  askEventQuestion,
  canRecordVoiceAudio,
  createVoiceRecorderSession,
  decodeBlobToWav16k,
  encodeMonoPcm16Wav,
  mixDownToMono,
  playAnswerAudio,
  runVoiceQuestionTurn,
  transcribeEventAudio,
  validateQuestionText,
} from './eventVoiceAudio'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function readAscii(bytes: Uint8Array, start: number, len: number): string {
  return String.fromCharCode(...bytes.slice(start, start + len))
}

function createFakeRecorderHarness(
  chunksToEmit: Blob[] = [new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })],
  options: { deferStop?: boolean } = {},
) {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  const stream = { getTracks: () => tracks } as unknown as MediaStream
  let lastRecorder: FakeMediaRecorder | null = null
  let lastOptions: MediaRecorderOptions | undefined

  class FakeMediaRecorder {
    state: RecordingState = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable: ((event: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: ((event: Event) => void) | null = null

    constructor(_stream: MediaStream, recOptions?: MediaRecorderOptions) {
      lastRecorder = this
      lastOptions = recOptions
    }

    start() {
      this.state = 'recording'
    }

    stop() {
      if (this.state === 'inactive') return
      this.state = 'inactive'
      if (options.deferStop) return
      this.flushStop()
    }

    flushStop() {
      for (const chunk of chunksToEmit) {
        this.ondataavailable?.({ data: chunk })
      }
      this.onstop?.()
    }
  }

  return {
    tracks,
    stream,
    RecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
    getRecorder: () => lastRecorder,
    getOptions: () => lastOptions,
  }
}

describe('Hỏi đáp giọng nói của sự kiện', () => {
  it('luôn cho phép nhập chữ, kể cả khi trình duyệt thiếu mic', () => {
    const html = renderToStaticMarkup(createElement(EventVoice, { eventId: 'may', onSpeakingChange: () => {} }))
    expect(html).toContain('<input')
    expect(html).toContain('Gửi câu hỏi')
    expect(html).toContain('nhập câu hỏi')
  })

  it('không còn dùng SpeechRecognition của trình duyệt hoặc bộ resample tự viết', () => {
    expect('listenToQuestion' in eventVoiceModule).toBe(false)
    expect('resampleMonoFloat32' in audioModule).toBe(false)
  })

  it('kiểm tra đúng OfflineAudioContext và hiển thị chú thích gửi qua Wayfinder tới Azure Speech', () => {
    expect(canRecordVoiceAudio({
      navigator: { mediaDevices: { getUserMedia: vi.fn() } },
      MediaRecorder: vi.fn(),
      AudioContext: vi.fn(),
    } as unknown as Window)).toBe(false)

    vi.stubGlobal('window', {
      navigator: { mediaDevices: { getUserMedia: vi.fn() } },
      MediaRecorder: vi.fn(),
      OfflineAudioContext: vi.fn(),
    })
    expect(canRecordVoiceAudio()).toBe(true)
    const html = renderToStaticMarkup(createElement(EventVoice, { eventId: 'may', onSpeakingChange: () => {} }))
    expect(html).toContain('Nói')
    expect(html).toContain('30 giây')
    expect(html).toContain('Wayfinder')
    expect(html).toContain('Azure Speech')
  })

  it('chỉ báo mascot nói khi giọng đọc bắt đầu và dừng khi hết câu', () => {
    const spoken = {
      onplaying: null as null | (() => void),
      onended: null as null | (() => void),
      onerror: null as null | (() => void),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    }
    const createAudio = vi.fn(() => spoken)
    const changes: boolean[] = []
    const stop = playAnswerAudio('SUQz', createAudio, speaking => changes.push(speaking), vi.fn())
    expect(createAudio).toHaveBeenCalledWith('data:audio/mpeg;base64,SUQz')
    expect(changes).toEqual([])
    spoken.onplaying?.()
    spoken.onended?.()
    expect(changes).toEqual([true, false])
    stop()
    expect(spoken.onplaying).toBeNull()
  })

  it('yêu cầu và giữ audio tiếng Việt kèm câu trả lời', async () => {
    const reply = { answer: 'Ở Sảnh Mây.', audioBase64: 'SUQz' }
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(reply)))
    const options = { fetchFn, withAudio: true }
    await expect(askEventQuestion('may/1', 'Ở đâu?', options)).resolves.toEqual(reply)
    expect(fetchFn).toHaveBeenCalledWith('/api/events/may%2F1/ask?voice=1', expect.any(Object))
  })

  it('chuyển giọng nói thành câu hỏi chỉ đường và chỉ gửi mã ảnh đã định vị', async () => {
    const wav = encodeMonoPcm16Wav(new Float32Array([.1, .2]))
    const question = 'Tôi đứng trước G101, đi đến G106 thế nào?'
    const route = { startId: 'g101_door', startLabel: 'Phòng G101', destinationId: 'G106' }
    const reply = { answer: 'Đi dọc hành lang đến G106.', audioBase64: 'SUQz', route }
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcript: question })))
      .mockResolvedValueOnce(new Response(JSON.stringify(reply)))
    const target = { photoId: 'p_0123456789ab', destinationId: 'G106' }
    await expect(runVoiceQuestionTurn(target, wav, { withAudio: true, fetchFn }))
      .resolves.toEqual({ transcript: question, ...reply })
    expect(fetchFn).toHaveBeenNthCalledWith(1, '/api/voice/transcribe', expect.objectContaining({ body: wav }))
    expect(fetchFn).toHaveBeenNthCalledWith(2, '/api/voice/directions?voice=1', expect.objectContaining({
      body: JSON.stringify({ question, ...target }),
    }))
  })

  it('giải mã qua OfflineAudioContext ở 16kHz, trộn mono và đóng gói WAV PCM16 little-endian chuẩn', async () => {
    const left = new Float32Array([1, -2, Number.NaN])
    const right = new Float32Array([1, -2, 0])
    expect(mixDownToMono([left, right])).toEqual(new Float32Array([1, -2, 0]))

    const ctorCalls: number[][] = []
    class FakeOfflineAudioContext {
      constructor(channels: number, length: number, sampleRate: number) {
        ctorCalls.push([channels, length, sampleRate])
      }
      decodeAudioData = vi.fn(async () => ({
        sampleRate: STT_SAMPLE_RATE,
        numberOfChannels: 2,
        length: left.length,
        getChannelData: (index: number) => (index === 0 ? left : right),
      }) as unknown as AudioBuffer)
    }

    vi.stubGlobal('window', { OfflineAudioContext: FakeOfflineAudioContext })
    const wav = await decodeBlobToWav16k(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }))

    expect(ctorCalls).toEqual([[1, 1, STT_SAMPLE_RATE]])
    expect(wav.byteLength).toBe(44 + 3 * 2)
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
    expect(readAscii(wav, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8)
    expect(readAscii(wav, 8, 4)).toBe('WAVE')
    expect(readAscii(wav, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint32(28, true)).toBe(32000) // byteRate
    expect(view.getUint16(32, true)).toBe(2) // blockAlign
    expect(view.getUint16(34, true)).toBe(16) // bitsPerSample
    expect(readAscii(wav, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(6)
    expect(view.getInt16(44, true)).toBe(32767)
    expect(view.getInt16(46, true)).toBe(-32768)
    expect(view.getInt16(48, true)).toBe(0)
  })

  it('giới hạn âm thanh đóng gói tối đa 30 giây và từ chối âm thanh rỗng', async () => {
    const over30s = new Float32Array(STT_SAMPLE_RATE * (MAX_RECORDING_SECONDS + 2))
    class FakeOfflineAudioContext {
      decodeAudioData = vi.fn(async () => ({
        sampleRate: STT_SAMPLE_RATE,
        numberOfChannels: 1,
        length: over30s.length,
        getChannelData: () => over30s,
      }) as unknown as AudioBuffer)
    }
    vi.stubGlobal('window', { OfflineAudioContext: FakeOfflineAudioContext })

    const wav = await decodeBlobToWav16k(new Blob([new Uint8Array([1, 2])], { type: 'audio/mp4' }))
    expect(wav.byteLength).toBe(44 + STT_SAMPLE_RATE * MAX_RECORDING_SECONDS * 2)
    await expect(decodeBlobToWav16k(new Blob([]))).rejects.toThrow()
    expect(encodeMonoPcm16Wav(new Float32Array([0.5])).byteLength).toBe(46)
  })

  it('ghi âm dùng định dạng mặc định trình duyệt, dừng trả Blob và giải phóng toàn bộ track', async () => {
    const harness = createFakeRecorderHarness()
    const session = createVoiceRecorderSession({
      getUserMedia: vi.fn().mockResolvedValue(harness.stream),
      MediaRecorderCtor: harness.RecorderCtor,
      onAutoStop: vi.fn(),
      onError: vi.fn(),
    })
    await session.start()
    expect(harness.getOptions()).toBeUndefined()
    const blob = await session.finish()
    expect(blob.size).toBe(3)
    expect(harness.tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(harness.tracks[1].stop).toHaveBeenCalledTimes(1)
  })

  it('tự dừng sau 30 giây và giao Blob để nhận diện', async () => {
    vi.useFakeTimers()
    const harness = createFakeRecorderHarness()
    const onAutoStop = vi.fn()
    const session = createVoiceRecorderSession({
      getUserMedia: vi.fn().mockResolvedValue(harness.stream),
      MediaRecorderCtor: harness.RecorderCtor,
      onAutoStop,
      onError: vi.fn(),
    })
    await session.start()
    vi.advanceTimersByTime(MAX_RECORDING_MS)
    await Promise.resolve()
    expect(onAutoStop).toHaveBeenCalledTimes(1)
    expect(onAutoStop.mock.calls[0][0].size).toBe(3)
    expect(harness.tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(harness.tracks[1].stop).toHaveBeenCalledTimes(1)
  })

  it('giữ bản ghi khi người dùng bấm dừng ngay sau mốc tự dừng', async () => {
    vi.useFakeTimers()
    const harness = createFakeRecorderHarness(undefined, { deferStop: true })
    const onAutoStop = vi.fn()
    const session = createVoiceRecorderSession({
      getUserMedia: async () => harness.stream,
      MediaRecorderCtor: harness.RecorderCtor,
      onAutoStop,
      onError: vi.fn(),
    })
    await session.start()
    vi.advanceTimersByTime(MAX_RECORDING_MS)
    const finished = session.finish()
    harness.getRecorder()?.flushStop()
    await expect(finished).resolves.toMatchObject({ size: 3 })
    expect(onAutoStop).not.toHaveBeenCalled()
    expect(harness.tracks[0].stop).toHaveBeenCalledTimes(1)
  })

  it('hủy khi đang xin quyền mic, đang ghi âm hoặc khi finish() chưa xong thì dừng sạch track', async () => {
    vi.useFakeTimers()
    const harness = createFakeRecorderHarness()
    let resolveMedia!: (stream: MediaStream) => void
    const pendingMedia = new Promise<MediaStream>(resolve => { resolveMedia = resolve })
    const onAutoStop = vi.fn()
    const session = createVoiceRecorderSession({
      getUserMedia: vi.fn(() => pendingMedia),
      MediaRecorderCtor: harness.RecorderCtor,
      onAutoStop,
      onError: vi.fn(),
    })
    const startPromise = session.start()
    session.cancel()
    resolveMedia(harness.stream)
    await expect(startPromise).resolves.toBe(false)
    expect(harness.getRecorder()).toBeNull()
    expect(harness.tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(harness.tracks[1].stop).toHaveBeenCalledTimes(1)

    const harness2 = createFakeRecorderHarness()
    const session2 = createVoiceRecorderSession({
      getUserMedia: vi.fn().mockResolvedValue(harness2.stream),
      MediaRecorderCtor: harness2.RecorderCtor,
      onAutoStop,
      onError: vi.fn(),
    })
    await session2.start()
    session2.cancel()
    vi.advanceTimersByTime(MAX_RECORDING_MS + 1000)
    expect(onAutoStop).not.toHaveBeenCalled()
    expect(harness2.tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(harness2.tracks[1].stop).toHaveBeenCalledTimes(1)

    const harness3 = createFakeRecorderHarness(undefined, { deferStop: true })
    const session3 = createVoiceRecorderSession({
      getUserMedia: vi.fn().mockResolvedValue(harness3.stream),
      MediaRecorderCtor: harness3.RecorderCtor,
      onAutoStop,
      onError: vi.fn(),
    })
    await session3.start()
    const finishing = session3.finish()
    session3.cancel()
    await expect(finishing).rejects.toMatchObject({ name: 'AbortError' })
    expect(harness3.tracks[0].stop).toHaveBeenCalledTimes(1)
    expect(harness3.tracks[1].stop).toHaveBeenCalledTimes(1)
  })

  it('gửi WAV lên /api/events/{id}/transcribe rồi chuyển tiếp transcript sang /ask và chặn phản hồi cũ khi abort', async () => {
    const wav = encodeMonoPcm16Wav(new Float32Array([0.25, -0.25]))
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ transcript: ' Trạm đầu ở đâu? ' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ answer: 'Trạm 1: Sân hoa.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    const seenTranscripts: string[] = []
    const controller = new AbortController()

    const result = await runVoiceQuestionTurn('may/1', wav, {
      signal: controller.signal,
      fetchFn: fetchMock,
      onTranscript: text => seenTranscripts.push(text),
    })

    expect(result).toEqual({ transcript: 'Trạm đầu ở đâu?', answer: 'Trạm 1: Sân hoa.' })
    expect(seenTranscripts).toEqual(['Trạm đầu ở đâu?'])
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/events/may%2F1/transcribe', expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'audio/wav' },
      signal: controller.signal,
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/events/may%2F1/ask', expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Trạm đầu ở đâu?' }),
      signal: controller.signal,
    }))

    const abortCtrl = new AbortController()
    let resolveTranscribe!: (res: Response) => void
    const slowFetch = vi.fn<typeof fetch>().mockReturnValueOnce(new Promise(r => { resolveTranscribe = r }))
    const onStaleTranscript = vi.fn()
    const pendingTurn = runVoiceQuestionTurn('may', wav, {
      signal: abortCtrl.signal,
      fetchFn: slowFetch,
      onTranscript: onStaleTranscript,
    })
    abortCtrl.abort()
    resolveTranscribe(new Response(JSON.stringify({ transcript: 'Câu cũ' }), { status: 200 }))
    await expect(pendingTurn).rejects.toThrow()
    expect(onStaleTranscript).not.toHaveBeenCalled()
    expect(slowFetch).toHaveBeenCalledTimes(1)
  })

  it('dùng chung kiểm tra câu hỏi của ask cho transcript và báo lỗi tiếng Việt từ máy chủ', async () => {
    const wav = encodeMonoPcm16Wav(new Float32Array([0.1, 0.2]))
    expect(validateQuestionText('   ')).toEqual({ ok: false, error: 'Hãy nhập câu hỏi.' })
    expect(validateQuestionText('a'.repeat(501)).ok).toBe(false)

    const longFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ transcript: 'a'.repeat(501) }), { status: 200 }),
    )
    await expect(runVoiceQuestionTurn('may', wav, { fetchFn: longFetch })).rejects.toThrow('500')
    expect(longFetch).toHaveBeenCalledTimes(1)

    const errFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Chưa nghe rõ câu hỏi.' }), { status: 422 }),
    )
    await expect(transcribeEventAudio('may', wav, { fetchFn: errFetch })).rejects.toThrow('Chưa nghe rõ câu hỏi.')

    const askErrFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Mascot bận.' }), { status: 503 }),
    )
    await expect(askEventQuestion('may', 'Ở đâu?', { fetchFn: askErrFetch })).rejects.toThrow('Mascot bận.')
  })
})
