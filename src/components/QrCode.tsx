import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface QrCodeProps {
  value: string
  /** Called with a PNG data URL so the page can offer a download. */
  onReady?: (pngDataUrl: string) => void
  className?: string
}

/** Renders a QR code for `value` as a crisp, high-resolution PNG image. */
export function QrCode({ value, onReady, className = '' }: QrCodeProps) {
  const [result, setResult] = useState<{ value: string; src: string | null; failed: boolean }>({
    value: '',
    src: null,
    failed: false,
  })

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((url) => {
        if (cancelled) return
        setResult({ value, src: url, failed: false })
        onReady?.(url)
      })
      .catch(() => {
        if (!cancelled) setResult({ value, src: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [value, onReady])

  if (result.failed && result.value === value) {
    return <p className="text-red-700">Could not generate the QR code. Use the link below.</p>
  }
  if (!result.src || result.value !== value) {
    return (
      <div
        className={`flex aspect-square items-center justify-center bg-slate-100 text-slate-500 ${className}`}
      >
        Generating QR code...
      </div>
    )
  }
  return (
    <img
      src={result.src}
      alt={`QR code linking to ${value}`}
      className={`aspect-square bg-white [image-rendering:pixelated] ${className}`}
    />
  )
}
