import { useCallback, useRef, useState, type ReactElement } from 'react'
import { ConfirmDialog, type ConfirmOptions } from './ConfirmDialog'

/**
 * Promise-based confirmation:
 *   const { confirm, dialog } = useConfirm()
 *   if (await confirm({ title: 'Delete?', confirmLabel: 'Delete' })) { ... }
 *   return <>{dialog}...</>
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  dialog: ReactElement
} {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const finish = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  const dialog = (
    <ConfirmDialog
      open={options !== null}
      title={options?.title ?? ''}
      body={options?.body}
      confirmLabel={options?.confirmLabel ?? 'Confirm'}
      tone={options?.tone}
      requireText={options?.requireText}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    />
  )

  return { confirm, dialog }
}
