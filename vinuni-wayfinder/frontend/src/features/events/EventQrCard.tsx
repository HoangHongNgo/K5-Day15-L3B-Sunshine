import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Copy, Download, QrCode } from 'lucide-react'
import { generateQrPngDataUrl } from './qrCode'

export interface EventQrCardProps {
  value: string
  title: string
  subtitle?: string
  filename?: string
  copyValue?: string
  copyLabel?: string
  compact?: boolean
  size?: number
}

export function EventQrCard({
  value,
  title,
  subtitle,
  filename,
  copyValue,
  copyLabel,
  compact = false,
  size,
}: EventQrCardProps) {
  const [dataUrl, setDataUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const copyTimerRef = useRef<number | null>(null)

  const displaySize = size ?? (compact ? 160 : 200)
  const renderSize = Math.max(displaySize * 2, 512)
  const textToCopy = copyValue ?? value

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setDataUrl('')

    generateQrPngDataUrl(value, renderSize)
      .then((url) => {
        if (cancelled) return
        setDataUrl(url)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('Không thể tạo mã QR. Vui lòng thử lại.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [value, renderSize])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  async function handleCopy() {
    setCopyError('')
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Trình duyệt chưa hỗ trợ sao chép nhanh.')
      }
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        copyTimerRef.current = null
      }, 2000)
    } catch {
      setCopied(false)
      setCopyError('Không thể sao chép tự động trên trình duyệt này.')
    }
  }

  function handleDownload() {
    if (!dataUrl) return
    const safeName = (filename || 'vinuni-event-qr').replace(/\.png$/i, '')
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${safeName}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <section className={compact ? 'event-qr-card compact' : 'event-qr-card'} aria-label={title}>
      <div className="event-qr-frame">
        {loading && (
          <div role="status" aria-live="polite">
            <QrCode size={24} aria-hidden="true" />
            <span>Đang tạo mã QR…</span>
          </div>
        )}
        {!loading && error && (
          <div role="alert">
            <AlertCircle size={22} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {!loading && !error && dataUrl && (
          <img
            src={dataUrl}
            alt={`Mã QR cho ${title}`}
            width={displaySize}
            height={displaySize}
          />
        )}
      </div>

      <div className="event-qr-copy">
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
        {copyError && (
          <p className="error-message" role="alert">
            {copyError}
          </p>
        )}
        <div className="event-qr-actions">
          <button
            type="button"
            className="button button-quiet"
            onClick={handleCopy}
            disabled={!textToCopy}
          >
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            <span>{copied ? 'Đã sao chép' : copyLabel ?? 'Sao chép liên kết'}</span>
          </button>
          <button
            type="button"
            className="button button-quiet"
            onClick={handleDownload}
            disabled={loading || Boolean(error) || !dataUrl}
          >
            <Download size={16} aria-hidden="true" />
            <span>Tải ảnh QR (PNG)</span>
          </button>
        </div>
      </div>
    </section>
  )
}
