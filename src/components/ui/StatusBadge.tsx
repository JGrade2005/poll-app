import { STATUS_LABELS } from '../../lib/format'
import type { SurveyStatus } from '../../lib/types'

// Text label + icon-like dot shape: status is never conveyed by color alone.
const styles: Record<SurveyStatus, { badge: string; marker: string }> = {
  draft: { badge: 'bg-slate-100 text-slate-800 border-slate-300', marker: '○' },
  active: { badge: 'bg-green-100 text-green-900 border-green-400', marker: '●' },
  closed: { badge: 'bg-amber-50 text-amber-900 border-amber-300', marker: '■' },
  archived: { badge: 'bg-zinc-100 text-zinc-700 border-zinc-300', marker: '▪' },
}

export function StatusBadge({ status }: { status: SurveyStatus }) {
  const style = styles[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium ${style.badge}`}
    >
      <span aria-hidden="true">{style.marker}</span>
      <span>
        <span className="sr-only">Status: </span>
        {STATUS_LABELS[status]}
      </span>
    </span>
  )
}
