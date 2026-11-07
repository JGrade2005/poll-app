import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'

export interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  /** When set, the user must type this word to enable the confirm button. */
  requireText?: string
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Accessible confirmation dialog built on the native <dialog> element
 * (focus trapping, Esc to cancel, inert background).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'danger',
  requireText,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const inputId = useId()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setTyped('')
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const canConfirm = !busy && (!requireText || typed.trim() === requireText)

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/50"
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (canConfirm) onConfirm()
        }}
      >
        <h2 id={titleId} className="text-xl font-semibold text-slate-900">
          {title}
        </h2>
        {body && <div className="mt-3 space-y-2 text-slate-700">{body}</div>}
        {requireText && (
          <div className="mt-4">
            <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
              Type <span className="font-mono font-bold">{requireText}</span> to confirm
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button onClick={onCancel} disabled={busy} autoFocus={!requireText}>
            Cancel
          </Button>
          <Button type="submit" variant={tone} disabled={!canConfirm}>
            {busy ? 'Working...' : confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
