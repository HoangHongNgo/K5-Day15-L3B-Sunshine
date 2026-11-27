import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkinPayload, eventShareUrl, generateQrPngDataUrl, generateQrSvg } from './qrCode'

describe('Event QR code helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('eventShareUrl', () => {
    it('builds a share URL with an explicit origin', () => {
      expect(eventShareUrl('robotics-open-lab', 'https://wayfinder.vinuni.edu.vn')).toBe(
        'https://wayfinder.vinuni.edu.vn/su-kien/robotics-open-lab',
      )
    })

    it('strips trailing slashes from origin', () => {
      expect(eventShareUrl('open-day', 'https://wayfinder.vinuni.edu.vn/')).toBe(
        'https://wayfinder.vinuni.edu.vn/su-kien/open-day',
      )
      expect(eventShareUrl('open-day', 'https://wayfinder.vinuni.edu.vn///')).toBe(
        'https://wayfinder.vinuni.edu.vn/su-kien/open-day',
      )
    })

    it('encodes special characters in eventId', () => {
      expect(eventShareUrl('su kien/clb 2026', 'https://vinuni.app')).toBe(
        'https://vinuni.app/su-kien/su%20kien%2Fclb%202026',
      )
    })

    it('uses window.location.origin when origin is omitted and window is defined', () => {
      vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
      expect(eventShareUrl('music-night')).toBe('http://localhost:5173/su-kien/music-night')
    })

    it('falls back to relative path when window is unavailable or origin is empty', () => {
      vi.stubGlobal('window', undefined)
      expect(eventShareUrl('music-night')).toBe('/su-kien/music-night')
      expect(eventShareUrl('music-night', '')).toBe('/su-kien/music-night')
    })
  })

  describe('checkinPayload', () => {
    it('formats check-in QR payload matching SUNSHINE-CHECKIN protocol', () => {
      expect(checkinPayload('robotics-open-lab')).toBe('SUNSHINE-CHECKIN:robotics-open-lab')
      expect(checkinPayload('EV_01')).toBe('SUNSHINE-CHECKIN:EV_01')
    })
  })

  describe('generateQrSvg', () => {
    it('generates a valid SVG string with default size 220', async () => {
      const svg = await generateQrSvg('https://wayfinder.vinuni.edu.vn/su-kien/robotics-open-lab')
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
      expect(svg).toContain('width="220"')
    })

    it('respects a custom size parameter', async () => {
      const svg = await generateQrSvg('SUNSHINE-CHECKIN:robotics-open-lab', 300)
      expect(svg).toContain('<svg')
      expect(svg).toContain('width="300"')
    })

    it('rejects when value is empty', async () => {
      await expect(generateQrSvg('')).rejects.toThrow()
    })
  })

  describe('generateQrPngDataUrl', () => {
    it('generates a valid base64 PNG data URL', async () => {
      const url = await generateQrPngDataUrl('https://wayfinder.vinuni.edu.vn/su-kien/robotics-open-lab')
      expect(url.startsWith('data:image/png;base64,')).toBe(true)
      expect(url.length).toBeGreaterThan('data:image/png;base64,'.length)
    })

    it('produces distinct PNG data URLs for different payloads and supports custom size', async () => {
      const sharePng = await generateQrPngDataUrl(eventShareUrl('ev-1', 'https://vinuni.app'), 256)
      const checkinPng = await generateQrPngDataUrl(checkinPayload('ev-1'), 256)
      expect(sharePng.startsWith('data:image/png;base64,')).toBe(true)
      expect(checkinPng.startsWith('data:image/png;base64,')).toBe(true)
      expect(sharePng).not.toBe(checkinPng)
    })

    it('rejects when value is empty', async () => {
      await expect(generateQrPngDataUrl('')).rejects.toThrow()
    })
  })
})
