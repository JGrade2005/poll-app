// Duplicate-submission protection (TODO.md Phase 8).
// Each browser gets a random token kept in localStorage; the database refuses
// a second response with the same token for the same survey. This protects
// against accidental double submissions, not against a determined student who
// clears their browser storage (students are anonymous by design).

const TOKEN_KEY = 'classroom-survey:anonymous-token'
const SUBMITTED_PREFIX = 'classroom-survey:submitted:'

let memoryToken: string | null = null
const memorySubmitted = new Set<string>()

function storage(): Storage | null {
  try {
    const s = window.localStorage
    const probe = '__cs_probe__'
    s.setItem(probe, probe)
    s.removeItem(probe)
    return s
  } catch {
    return null // private mode / storage disabled
  }
}

/** RFC 4122 v4 UUID. crypto.randomUUID is missing on plain-http LAN URLs, so fall back. */
export function randomToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // insecure context: fall through
    }
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function getAnonymousToken(): string {
  const s = storage()
  if (s) {
    let token = s.getItem(TOKEN_KEY)
    if (!token) {
      token = randomToken()
      s.setItem(TOKEN_KEY, token)
    }
    return token
  }
  memoryToken ??= randomToken()
  return memoryToken
}

export function hasSubmitted(surveyId: string): boolean {
  const s = storage()
  return s ? s.getItem(SUBMITTED_PREFIX + surveyId) !== null : memorySubmitted.has(surveyId)
}

export function markSubmitted(surveyId: string): void {
  const s = storage()
  if (s) s.setItem(SUBMITTED_PREFIX + surveyId, new Date().toISOString())
  else memorySubmitted.add(surveyId)
}
