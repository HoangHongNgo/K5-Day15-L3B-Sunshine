import { useEffect, useRef, useState } from 'react'
import { Mic, Send, Square, Volume2 } from 'lucide-react'
import './eventVoice.css'

type RecognitionResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionResult) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}
type Utterance = Pick<SpeechSynthesisUtterance, 'text' | 'lang' | 'onstart' | 'onend' | 'onerror'>

export function listenToQuestion(
  rec: Recognition, onText: (text: string) => void, onError: (error: string) => void, onEnd: () => void,
) {
  rec.lang = 'vi-VN'
  rec.continuous = false
  rec.interimResults = false
  rec.onresult = event => {
    const transcript = event.results[0]?.[0]?.transcript.trim()
    if (transcript) onText(transcript)
  }
  rec.onerror = event => onError(event.error)
  rec.onend = onEnd
  rec.start()
  return () => {
    rec.onresult = rec.onerror = rec.onend = null
    rec.abort()
  }
}

export function speakAnswer<T extends Utterance>(
  text: string, synthesis: { speak: (utterance: T) => void; cancel(): void },
  createUtterance: () => T, onSpeaking: (speaking: boolean) => void, onError?: () => void,
) {
  const utterance = createUtterance()
  utterance.text = text
  utterance.lang = 'vi-VN'
  utterance.onstart = () => onSpeaking(true)
  utterance.onend = () => onSpeaking(false)
  utterance.onerror = () => { onSpeaking(false); onError?.() }
  synthesis.speak(utterance)
  return () => {
    utterance.onstart = utterance.onend = utterance.onerror = null
    synthesis.cancel()
    onSpeaking(false)
  }
}

type Props = { eventId: string; onSpeakingChange: (speaking: boolean) => void }

export default function EventVoice(props: Props) {
  return <VoiceForm key={props.eventId} {...props} />
}

function VoiceForm({ eventId, onSpeakingChange }: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [notice, setNotice] = useState('')
  const request = useRef<AbortController | null>(null)
  const stopMic = useRef<(() => void) | null>(null)
  const stopAudio = useRef<(() => void) | null>(null)
  const callback = useRef(onSpeakingChange)
  useEffect(() => { callback.current = onSpeakingChange }, [onSpeakingChange])
  useEffect(() => () => {
    request.current?.abort()
    stopMic.current?.()
    stopAudio.current?.()
  }, [])

  const browser = typeof window === 'undefined' ? undefined : window as SpeechWindow
  const RecognitionApi = browser?.SpeechRecognition || browser?.webkitSpeechRecognition
  const canRead = !!browser?.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined'

  function read(text: string) {
    stopAudio.current?.()
    if (!canRead) return
    setNotice('')
    try {
      stopAudio.current = speakAnswer(text, window.speechSynthesis, () => new SpeechSynthesisUtterance(),
        active => { setSpeaking(active); callback.current(active) },
        () => setNotice('Thiết bị chưa phát được giọng đọc. Bạn có thể đọc câu trả lời bên dưới.'))
    } catch {
      setNotice('Thiết bị chưa phát được giọng đọc. Bạn có thể đọc câu trả lời bên dưới.')
    }
  }

  async function ask(value: string) {
    const text = value.trim()
    if (!text || request.current) return
    if (Array.from(text).length > 500) {
      setNotice('Hãy rút gọn câu hỏi còn tối đa 500 ký tự.')
      return
    }
    stopAudio.current?.()
    stopMic.current?.()
    stopMic.current = null
    setListening(false)
    const controller = new AbortController()
    request.current = controller
    setNotice('')
    setBusy(true)
    setAnswer('')
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/ask`, {
        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }), signal: controller.signal,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || typeof body.answer !== 'string') {
        throw new Error(typeof body.detail === 'string' ? body.detail : 'Chưa lấy được câu trả lời. Bạn hãy thử lại.')
      }
      if (!controller.signal.aborted) {
        setAnswer(body.answer)
        read(body.answer)
      }
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error instanceof TypeError
        ? 'Chưa kết nối được máy chủ sự kiện. Hãy kiểm tra mạng và thử lại.'
        : error instanceof Error ? error.message : 'Chưa lấy được câu trả lời.')
    } finally {
      request.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function toggleMic() {
    if (listening) {
      stopMic.current?.()
      stopMic.current = null
      setListening(false)
      return
    }
    if (!RecognitionApi) return
    stopAudio.current?.()
    setNotice('')
    try {
      stopMic.current = listenToQuestion(new RecognitionApi(), text => {
        setQuestion(text)
        void ask(text)
      }, error => {
        setListening(false)
        setNotice(error === 'not-allowed' || error === 'service-not-allowed'
          ? 'Mic chưa được cấp quyền. Bạn có thể nhập câu hỏi.'
          : 'Chưa nghe rõ câu hỏi. Hãy thử lại hoặc nhập bằng bàn phím.')
      }, () => { setListening(false); stopMic.current = null })
      setListening(true)
    } catch {
      setListening(false)
      setNotice('Chưa mở được mic. Bạn có thể nhập câu hỏi.')
    }
  }

  return <form className="event-voice" onSubmit={event => { event.preventDefault(); void ask(question) }}>
    <label>Câu hỏi về sự kiện
      <input value={question} maxLength={500} onChange={event => setQuestion(event.target.value)}
        placeholder="Ví dụ: Trạm đầu tiên ở đâu?" autoComplete="off" />
    </label>
    <small>{RecognitionApi ? 'Bấm Nói để hỏi ngay. Trình duyệt có thể dùng dịch vụ nhận dạng trực tuyến.'
      : 'Trình duyệt chưa hỗ trợ nhận giọng nói. Bạn có thể nhập câu hỏi.'}</small>
    <div className="event-voice-actions">
      {RecognitionApi && <button type="button" onClick={toggleMic} disabled={busy} aria-pressed={listening}>
        {listening ? <Square size={16} /> : <Mic size={16} />}{listening ? 'Hủy nghe' : 'Nói'}</button>}
      <button type="submit" disabled={busy || !question.trim()}><Send size={16} />Gửi câu hỏi</button>
    </div>
    <div role="status" aria-live="polite">
      {listening && <p>Đang nghe…</p>}{busy && <p>Đang tìm câu trả lời…</p>}
      {answer && <p>{answer}</p>}{notice && <p>{notice}</p>}
    </div>
    {answer && canRead && <button type="button" onClick={() => speaking ? stopAudio.current?.() : read(answer)}>
      {speaking ? <Square size={16} /> : <Volume2 size={16} />}{speaking ? 'Dừng đọc' : 'Nghe lại'}</button>}
  </form>
}
