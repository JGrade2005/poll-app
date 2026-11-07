interface LoadingStateProps {
  label?: string
  fullPage?: boolean
}

/** Spinner plus text; announced politely to screen readers. */
export function LoadingState({ label = 'Loading...', fullPage = false }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-3 text-slate-600 ${
        fullPage ? 'min-h-[60vh]' : 'py-12'
      }`}
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700 motion-reduce:animate-none"
      />
      <span className="text-lg">{label}</span>
    </div>
  )
}
