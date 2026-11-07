import type { ReactNode } from 'react'

type Tone = 'error' | 'info' | 'success' | 'warning'

const tones: Record<Tone, string> = {
  error: 'border-red-300 bg-red-50 text-red-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  success: 'border-green-300 bg-green-50 text-green-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
}

interface AlertProps {
  tone?: Tone
  title?: string
  children?: ReactNode
  className?: string
}

export function Alert({ tone = 'info', title, children, className = '' }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 ${tones[tone]} ${className}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  )
}
