import { useEffect, useRef } from 'react'

const APP_NAME = 'Classroom Survey'

export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME
  }, [title])
}

/**
 * Calls `callback` every `ms` milliseconds while `enabled` is true and the tab
 * is visible, and once immediately when a hidden tab becomes visible again.
 * Used for live response counts (polling instead of Supabase Realtime).
 */
export function useInterval(callback: () => void, ms: number, enabled = true): void {
  const saved = useRef(callback)

  useEffect(() => {
    saved.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') saved.current()
    }, ms)
    const onVisible = () => {
      if (document.visibilityState === 'visible') saved.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms, enabled])
}
