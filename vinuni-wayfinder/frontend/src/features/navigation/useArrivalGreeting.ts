import { useCallback, useEffect, useRef } from 'react'

export function useArrivalGreeting(journeyKey: string, destination: string | undefined) {
  const message = destination ? `Bạn đã đến ${destination} rồi!` : ''
  const speech = typeof window !== 'undefined' && typeof SpeechSynthesisUtterance === 'function'
    ? window.speechSynthesis : undefined
  const active = useRef<SpeechSynthesisUtterance | null>(null)

  const replay = useCallback(() => {
    if (!speech || !message) return
    if (active.current) speech.cancel()
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.lang = 'vi-VN'
    utterance.voice = speech.getVoices().find(voice => /^vi(?:-|$)/i.test(voice.lang)) ?? null
    const finish = () => { if (active.current === utterance) active.current = null }
    utterance.onend = finish
    utterance.onerror = finish
    active.current = utterance
    speech.speak(utterance)
  }, [message, speech])

  useEffect(() => {
    if (!speech || !message) return
    let cancelled = false
    // Wait until the effect is committed, including the StrictMode cleanup on mount.
    queueMicrotask(() => { if (!cancelled) replay() })
    return () => {
      cancelled = true
      if (active.current) speech.cancel()
      active.current = null
    }
  }, [journeyKey, message, replay, speech])

  return { message, replay: speech ? replay : undefined }
}
