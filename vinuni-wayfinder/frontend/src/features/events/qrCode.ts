import QRCode from 'qrcode'

export function eventShareUrl(eventId: string, origin?: string): string {
  const rawOrigin = origin ?? (typeof window !== 'undefined' && window.location ? window.location.origin : '')
  const normalizedOrigin = rawOrigin.replace(/\/+$/, '')
  return `${normalizedOrigin}/su-kien/${encodeURIComponent(eventId)}`
}

export function checkinPayload(eventId: string): string {
  return `SUNSHINE-CHECKIN:${eventId}`
}

export async function generateQrSvg(value: string, size?: number): Promise<string> {
  if (!value) throw new Error('Nội dung mã QR không được để trống.')
  return QRCode.toString(value, {
    type: 'svg',
    width: size ?? 220,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
}

export async function generateQrPngDataUrl(value: string, size?: number): Promise<string> {
  if (!value) throw new Error('Nội dung mã QR không được để trống.')
  return QRCode.toDataURL(value, {
    width: size ?? 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
}
