import type { SurveyStatus } from './types'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** "Aug 17, 2026" */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

/** "Aug 17, 2026, 12:05 PM" */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso))
}

export const STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
  archived: 'Archived',
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** "Recursion Concept Check" -> "recursion-concept-check" (for file names). */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug || 'survey'
}
