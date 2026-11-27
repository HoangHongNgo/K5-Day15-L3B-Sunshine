import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import EventVoice, { listenToQuestion, speakAnswer } from './EventVoice'

describe('Hỏi đáp giọng nói của sự kiện', () => {
  it('luôn cho phép nhập chữ, kể cả khi trình duyệt thiếu mic', () => {
    const html = renderToStaticMarkup(createElement(EventVoice, { eventId: 'may', onSpeakingChange: () => {} }))
    expect(html).toContain('<input')
    expect(html).toContain('Gửi câu hỏi')
    expect(html).toContain('nhập câu hỏi')
  })

  it('chỉ chuyển lời nói đã nhận dạng, dùng tiếng Việt và ngắt mic khi đóng', () => {
    const rec = { start: vi.fn(), abort: vi.fn(), lang: '', continuous: true, interimResults: true,
      onresult: null as null | ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void),
      onend: null, onerror: null }
    const results: string[] = []
    const stop = listenToQuestion(rec, value => results.push(value), () => {}, () => {})
    expect(rec.lang).toBe('vi-VN')
    expect(rec.interimResults).toBe(false)
    rec.onresult?.({ results: [[{ transcript: ' Địa điểm ở đâu? ' }]] })
    expect(results).toEqual(['Địa điểm ở đâu?'])
    stop()
    expect(rec.abort).toHaveBeenCalled()
    expect(rec.onresult).toBeNull()
  })

  it('chỉ báo mascot nói khi giọng đọc bắt đầu và dừng khi hết câu', () => {
    const spoken = { text: '', lang: '', onstart: null as null | (() => void),
      onend: null as null | (() => void), onerror: null as null | (() => void) }
    const synthesis = { speak: vi.fn(), cancel: vi.fn() }
    const changes: boolean[] = []
    const stop = speakAnswer('Ở Sảnh Mây.', synthesis, () => spoken, speaking => changes.push(speaking))
    expect(spoken.lang).toBe('vi-VN')
    expect(spoken.text).toBe('Ở Sảnh Mây.')
    expect(changes).toEqual([])
    spoken.onstart?.()
    spoken.onend?.()
    expect(changes).toEqual([true, false])
    stop()
    expect(spoken.onstart).toBeNull()
  })
})
