// Maps Supabase / PostgreSQL errors to friendly messages (API.md section 13).
// Students never see raw database exceptions.

export type ErrorKind =
  | 'network'
  | 'auth'
  | 'not_found'
  | 'closed'
  | 'duplicate'
  | 'validation'
  | 'conflict'
  | 'unexpected'

/** Error codes raised by the RPC functions in supabase/migrations. */
export const DB_ERROR_CODES = [
  'SURVEY_NOT_ACTIVE',
  'DUPLICATE_RESPONSE',
  'INVALID_QUESTION_TYPE',
  'INVALID_QUESTION',
  'INVALID_CHOICE',
  'MISSING_REQUIRED_ANSWER',
  'INVALID_PAYLOAD',
  'SURVEY_NOT_FOUND',
  'SURVEY_HAS_NO_QUESTIONS',
  'SURVEY_IS_ACTIVE',
  'SURVEY_HAS_RESPONSES',
  'TITLE_REQUIRED',
  'QUESTION_TEXT_REQUIRED',
  'NOT_ENOUGH_CHOICES',
  'CHOICE_TEXT_REQUIRED',
] as const

export type DbErrorCode = (typeof DB_ERROR_CODES)[number]

interface ErrorLike {
  message?: unknown
  code?: unknown
  name?: unknown
  status?: unknown
}

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === 'object' && error !== null ? (error as ErrorLike) : {}
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  const msg = asErrorLike(error).message
  return typeof msg === 'string' ? msg : ''
}

/** Returns the RPC error code (e.g. DUPLICATE_RESPONSE) if the error carries one. */
export function dbErrorCode(error: unknown): DbErrorCode | null {
  const message = messageOf(error)
  return (
    DB_ERROR_CODES.find((code) => message === code) ??
    DB_ERROR_CODES.find((code) => new RegExp(`\\b${code}\\b`).test(message)) ??
    null
  )
}

export function isNetworkError(error: unknown): boolean {
  const message = messageOf(error).toLowerCase()
  const name = asErrorLike(error).name
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    name === 'AuthRetryableFetchError'
  )
}

export function classifyError(error: unknown): ErrorKind {
  if (isNetworkError(error)) return 'network'

  switch (dbErrorCode(error)) {
    case 'SURVEY_NOT_ACTIVE':
      return 'closed'
    case 'DUPLICATE_RESPONSE':
      return 'duplicate'
    case 'SURVEY_NOT_FOUND':
      return 'not_found'
    case 'SURVEY_IS_ACTIVE':
    case 'SURVEY_HAS_RESPONSES':
      return 'conflict'
    case null:
      break
    default:
      return 'validation'
  }

  const { code, status } = asErrorLike(error)
  // 42501 = insufficient_privilege, PGRST301/302 = JWT problems, 401/403 HTTP
  if (
    code === '42501' ||
    code === 'PGRST301' ||
    code === 'PGRST302' ||
    status === 401 ||
    status === 403
  ) {
    return 'auth'
  }
  // PGRST116 = .single() found no row
  if (code === 'PGRST116') return 'not_found'
  return 'unexpected'
}

const STUDENT_MESSAGES: Record<ErrorKind, string> = {
  network: 'Could not reach the server. Check your internet connection and try again.',
  auth: 'Something went wrong. Please try again.',
  not_found: 'Survey not found.',
  closed: 'This survey is no longer accepting responses.',
  duplicate: 'You have already submitted a response to this survey.',
  validation: 'This survey has changed since you opened it. Please reload the page and try again.',
  conflict: 'Something went wrong. Please try again.',
  unexpected: 'Something went wrong. Please try again.',
}

/** Friendly message for the public student page. Never includes raw DB text. */
export function studentErrorMessage(error: unknown): string {
  if (dbErrorCode(error) === 'MISSING_REQUIRED_ANSWER') {
    return 'Please answer every question before submitting.'
  }
  return STUDENT_MESSAGES[classifyError(error)]
}

const INSTRUCTOR_CODE_MESSAGES: Partial<Record<DbErrorCode, string>> = {
  SURVEY_NOT_FOUND: 'Survey not found. It may have been deleted.',
  SURVEY_HAS_NO_QUESTIONS: 'Add at least one question before activating this survey.',
  SURVEY_IS_ACTIVE: 'This survey is active. Close it before editing.',
  SURVEY_HAS_RESPONSES:
    'This survey already has responses, so its questions cannot be changed. Duplicate it to make a new version.',
  TITLE_REQUIRED: 'Survey title is required.',
  QUESTION_TEXT_REQUIRED: 'Every question needs text.',
  INVALID_QUESTION_TYPE: 'Unsupported question type.',
  NOT_ENOUGH_CHOICES: 'Multiple choice questions need at least two choices.',
  CHOICE_TEXT_REQUIRED: 'Answer choices cannot be blank.',
}

/** Friendly message for instructor pages. */
export function instructorErrorMessage(error: unknown): string {
  const code = dbErrorCode(error)
  const known = code ? INSTRUCTOR_CODE_MESSAGES[code] : undefined
  if (known) return known
  switch (classifyError(error)) {
    case 'network':
      return 'Network error: could not reach the database. Check your connection and try again.'
    case 'auth':
      return 'Authentication required. Please log in again.'
    case 'not_found':
      return 'Survey not found.'
    case 'validation':
      return 'The database rejected this change. Please check the form and try again.'
    default:
      return 'Unexpected server error. Please try again.'
  }
}
