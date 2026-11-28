import { useEffect, useRef, useState } from 'react'
import { Camera, Mic, Send, Square, Volume2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { BackendLocateResponse } from '../wayfinder/wayfinderApi'
import {
  MAX_QUESTION_CHARS,
  MAX_RECORDING_SECONDS,
  askEventQuestion,
  canRecordVoiceAudio,
  createVoiceRecorderSession,
  decodeBlobToWav16k,
  playAnswerAudio,
  runVoiceQuestionTurn,
  validateQuestionText,
  voiceRouteHref,
  type VoiceAnswer,
  type VoiceRecorderSession,
} from './eventVoiceAudio'
import './eventVoice.css'

type Stage = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'asking' | 'locating'

function formatVoiceError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return 'Chưa kết nối được máy chủ Wayfinder. Hãy kiểm tra mạng và thử lại.'
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function formatMicError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' || error.name === 'SecurityError') {
      return 'Mic chưa được cấp quyền. Bạn hãy bật quyền micro hoặc nhập câu hỏi.'
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'Không tìm thấy micro trên thiết bị. Bạn có thể nhập câu hỏi.'
    }
  }
  if (error instanceof Error && error.message) return error.message
  return 'Chưa mở được micro. Bạn có thể nhập câu hỏi.'
}

type NavigationVoice = {
  destinationId?: string
  locatePhoto?: (signal: AbortSignal) => Promise<BackendLocateResponse>
}
type Props = { eventId?: string; navigation?: NavigationVoice; onSpeakingChange?: (speaking: boolean) => void }

export default function EventVoice({ eventId, navigation, onSpeakingChange }: Props) {
  const [chooseDirections, setChooseDirections] = useState(false)
  const directions = !eventId || Boolean(navigation && chooseDirections)
  return <>
    {eventId && navigation && <div className="event-voice-tabs" role="group" aria-label="Nội dung hỏi">
      <button type="button" aria-pressed={!directions} onClick={() => setChooseDirections(false)}>Sự kiện</button>
      <button type="button" aria-pressed={directions} onClick={() => setChooseDirections(true)}>Chỉ đường</button>
    </div>}
    <VoiceForm key={directions ? `directions:${navigation?.destinationId ?? ''}` : eventId} eventId={directions ? undefined : eventId}
      navigation={directions ? navigation : undefined} onSpeakingChange={onSpeakingChange} />
  </>
}

function VoiceForm({ eventId, navigation, onSpeakingChange }: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<VoiceAnswer | null>(null)
  const [photo, setPhoto] = useState<{ photoId: string; label: string } | null>(null)
  const answerAudio = answer?.audioBase64
  const [stage, setStage] = useState<Stage>('idle')
  const [elapsedSec, setElapsedSec] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [notice, setNotice] = useState('')
  const turnId = useRef(0)
  const request = useRef<AbortController | null>(null)
  const recorder = useRef<VoiceRecorderSession | null>(null)
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopAudio = useRef<(() => void) | null>(null)
  const callback = useRef(onSpeakingChange)

  useEffect(() => {
    callback.current = onSpeakingChange
  }, [onSpeakingChange])

  function clearElapsed() {
    if (elapsedTimer.current !== null) {
      clearInterval(elapsedTimer.current)
      elapsedTimer.current = null
    }
    setElapsedSec(0)
  }

  function abortCurrentTurn() {
    turnId.current += 1
    clearElapsed()
    recorder.current?.cancel()
    recorder.current = null
    request.current?.abort()
    request.current = null
  }

  useEffect(() => () => {
    abortCurrentTurn()
    stopAudio.current?.()
  }, [])

  const canRecord = canRecordVoiceAudio()
  const canRead = typeof Audio !== 'undefined'
  const voiceTarget = eventId ?? { destinationId: navigation?.destinationId, photoId: photo?.photoId }

  async function captureLocation() {
    if (stage !== 'idle' || !navigation?.locatePhoto) return
    stopAudio.current?.()
    const controller = new AbortController()
    request.current = controller
    setStage('locating')
    setPhoto(null)
    setAnswer(null)
    setNotice('')
    try {
      const result = await navigation.locatePhoto(controller.signal)
      if (controller.signal.aborted) return
      if (result.tier === 'auto' && result.photoId && result.label) {
        setPhoto({ photoId: result.photoId, label: result.label })
      } else {
        setNotice('Ảnh chưa đủ rõ để định vị. Hãy hướng camera về biển phòng, hoặc mô tả mốc bạn thấy.')
      }
    } catch {
      if (!controller.signal.aborted) setNotice('Chưa định vị được bằng ảnh. Bạn có thể mô tả mốc bằng lời.')
    } finally {
      if (request.current === controller) request.current = null
      if (!controller.signal.aborted) setStage('idle')
    }
  }

  function read(audioBase64: string) {
    stopAudio.current?.()
    setNotice('')
    const onPlaybackError = () => setNotice('Chưa phát được giọng đọc. Bạn có thể bấm “Nghe lại”.')
    try {
      stopAudio.current = playAnswerAudio(
        audioBase64,
        src => new Audio(src),
        active => {
          setSpeaking(active)
          callback.current?.(active)
        },
        onPlaybackError,
      )
    } catch {
      onPlaybackError()
    }
  }

  function showAnswer(reply: VoiceAnswer) {
    setAnswer(reply)
    if (!canRead) return
    if (reply.audioBase64) read(reply.audioBase64)
    else setNotice('Giọng đọc tiếng Việt tạm thời chưa khả dụng.')
  }

  async function submitRecordedBlob(blob: Blob, myTurn: number) {
    if (turnId.current !== myTurn) return
    clearElapsed()
    recorder.current = null
    setStage('transcribing')
    setNotice('')
    setAnswer(null)
    const controller = new AbortController()
    request.current = controller
    try {
      const wav = await decodeBlobToWav16k(blob)
      if (turnId.current !== myTurn || controller.signal.aborted) return
      const reply = await runVoiceQuestionTurn(voiceTarget, wav, {
        signal: controller.signal,
        withAudio: canRead,
        onTranscript: transcript => {
          if (turnId.current !== myTurn || controller.signal.aborted) return
          setQuestion(transcript)
          setStage('asking')
        },
      })
      if (turnId.current !== myTurn || controller.signal.aborted) return
      showAnswer(reply)
    } catch (error) {
      if (turnId.current !== myTurn || controller.signal.aborted) return
      setNotice(formatVoiceError(error, 'Chưa nhận diện được giọng nói. Bạn hãy thử lại hoặc nhập câu hỏi.'))
    } finally {
      if (request.current === controller) request.current = null
      if (turnId.current === myTurn) setStage('idle')
    }
  }

  async function askTyped(value: string) {
    if (stage !== 'idle') return
    const checked = validateQuestionText(value)
    if (!checked.ok) {
      if (value.trim()) setNotice(checked.error)
      return
    }
    abortCurrentTurn()
    stopAudio.current?.()
    const myTurn = turnId.current
    const controller = new AbortController()
    request.current = controller
    setNotice('')
    setAnswer(null)
    setStage('asking')
    try {
      const reply = await askEventQuestion(voiceTarget, checked.text, { signal: controller.signal, withAudio: canRead })
      if (turnId.current !== myTurn || controller.signal.aborted) return
      showAnswer(reply)
    } catch (error) {
      if (turnId.current !== myTurn || controller.signal.aborted) return
      setNotice(formatVoiceError(error, 'Chưa lấy được câu trả lời. Bạn hãy thử lại.'))
    } finally {
      if (request.current === controller) request.current = null
      if (turnId.current === myTurn) setStage('idle')
    }
  }

  async function startRecording() {
    if (!canRecord || stage !== 'idle') return
    stopAudio.current?.()
    abortCurrentTurn()
    const myTurn = turnId.current
    setNotice('')
    setStage('requesting')
    const session = createVoiceRecorderSession({
      getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
      MediaRecorderCtor: MediaRecorder,
      onAutoStop: blob => {
        void submitRecordedBlob(blob, myTurn)
      },
      onError: message => {
        if (turnId.current !== myTurn) return
        clearElapsed()
        recorder.current = null
        setStage('idle')
        setNotice(message)
      },
    })
    recorder.current = session
    try {
      const started = await session.start()
      if (turnId.current !== myTurn || !started) return
      setStage('recording')
      setElapsedSec(0)
      elapsedTimer.current = setInterval(() => {
        setElapsedSec(prev => Math.min(MAX_RECORDING_SECONDS, prev + 1))
      }, 1000)
    } catch (error) {
      if (turnId.current !== myTurn) return
      clearElapsed()
      recorder.current = null
      setStage('idle')
      setNotice(formatMicError(error))
    }
  }

  async function finishRecording() {
    if (stage !== 'recording' || !recorder.current) return
    const myTurn = turnId.current
    const active = recorder.current
    clearElapsed()
    setStage('transcribing')
    try {
      const blob = await active.finish()
      if (recorder.current === active) recorder.current = null
      if (turnId.current !== myTurn) return
      await submitRecordedBlob(blob, myTurn)
    } catch (error) {
      if (recorder.current === active) recorder.current = null
      if (turnId.current !== myTurn) return
      setStage('idle')
      setNotice(formatVoiceError(error, 'Không hoàn tất được bản ghi âm. Bạn hãy thử lại hoặc nhập câu hỏi.'))
    }
  }

  function cancelRecording() {
    if (stage !== 'requesting' && stage !== 'recording') return
    abortCurrentTurn()
    setStage('idle')
    setNotice('')
  }

  return (
    <form className="event-voice" onSubmit={event => { event.preventDefault(); void askTyped(question) }}>
      <label>
        {eventId ? 'Câu hỏi về sự kiện' : 'Hỏi chỉ đường'}
        <input
          value={question}
          maxLength={MAX_QUESTION_CHARS}
          onChange={event => setQuestion(event.target.value)}
          placeholder={eventId ? 'Ví dụ: Trạm đầu tiên ở đâu?' : 'Ví dụ: Mình đứng trước phòng G101, đi G106 thế nào?'}
          autoComplete="off"
        />
      </label>
      <small>
        {canRecord
          ? `Bấm Nói để ghi âm tiếng Việt (tối đa ${MAX_RECORDING_SECONDS} giây). Âm thanh gửi qua Wayfinder tới Azure Speech.`
          : 'Trình duyệt chưa hỗ trợ ghi âm (cần HTTPS hoặc localhost). Bạn có thể nhập câu hỏi.'}
      </small>
      <div className="event-voice-actions">
        {canRecord && stage === 'recording' && (
          <>
            <button type="button" onClick={() => void finishRecording()} aria-pressed={true}>
              <Square size={16} />Dừng và hỏi
            </button>
            <button type="button" onClick={cancelRecording}>
              <X size={16} />Hủy ghi
            </button>
          </>
        )}
        {canRecord && stage === 'requesting' && (
          <button type="button" onClick={cancelRecording} aria-pressed={true}>
            <X size={16} />Hủy micro
          </button>
        )}
        {canRecord && stage !== 'recording' && stage !== 'requesting' && (
          <button type="button" onClick={() => void startRecording()} disabled={stage !== 'idle'} aria-pressed={false}>
            <Mic size={16} />Nói
          </button>
        )}
        <button type="submit" disabled={stage !== 'idle' || !question.trim()}>
          <Send size={16} />Gửi câu hỏi
        </button>
        {navigation?.locatePhoto && <button type="button" disabled={stage !== 'idle'} onClick={() => void captureLocation()}>
          <Camera size={16} />Dùng ảnh xung quanh
        </button>}
        {photo && <button type="button" disabled={stage !== 'idle'} onClick={() => {
          stopAudio.current?.()
          setPhoto(null)
          setAnswer(null)
          setNotice('')
        }}>Bỏ ảnh vị trí</button>}
      </div>
      <div role="status" aria-live="polite">
        {stage === 'requesting' && <p>Đang mở micro…</p>}
        {stage === 'recording' && <p>Đang ghi âm ({elapsedSec}/{MAX_RECORDING_SECONDS} giây)… Bấm “Dừng và hỏi” khi nói xong.</p>}
        {stage === 'transcribing' && <p>Đang nhận diện giọng nói…</p>}
        {stage === 'locating' && <p>Đang đối chiếu ảnh vị trí…</p>}
        {stage === 'asking' && <p>Đang tìm câu trả lời…</p>}
        {photo && <p>Ảnh nhận diện: {photo.label}.</p>}
        {answer && <p>{answer.answer}</p>}
        {notice && <p>{notice}</p>}
      </div>
      {answer?.route && <Link className="event-voice-route" to={voiceRouteHref(answer.route)}>Mở lộ trình</Link>}
      {answerAudio && (
        <button type="button" disabled={stage !== 'idle'} onClick={() => (speaking ? stopAudio.current?.() : read(answerAudio))}>
          {speaking ? <Square size={16} /> : <Volume2 size={16} />}
          {speaking ? 'Dừng đọc' : 'Nghe lại'}
        </button>
      )}
    </form>
  )
}
